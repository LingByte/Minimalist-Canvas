import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Popover, Tooltip } from "antd";
import {
    ChevronDown,
    MessageSquare,
    Plus,
    Settings2,
    Sparkles,
    Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { AgentChatTimeline } from "./agent-chat";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentPanelTabs } from "./agent-panel-tabs";
import { BuiltinAgentSkillsView } from "./builtin-agent-skills-view";
import { runBuiltinAgentHarness } from "@canvas/lib/agent/builtin-agent-harness";
import {
    deleteBuiltinAgentThread,
    loadBuiltinAgentThreads,
    titleFromMessages,
    upsertBuiltinAgentThread,
    type BuiltinAgentThread,
} from "@canvas/lib/canvas/builtin-agent-threads";
import { useCanvasHost } from "@canvas/integration/canvas-host-context";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { readImageMeta } from "@canvas/lib/image-utils";
import { uploadToConfiguredObjectStorage } from "@canvas/lib/object-storage/client";
import { isObjectStorageConfigured } from "@canvas/lib/object-storage/types";
import { randomId } from "@canvas/lib/utils";
import { assertCanvasMediaUploadSize, MAX_CANVAS_UPLOAD_BYTES } from "@canvas/services/object-storage";
import { useAgentStore, type AgentAttachment, type AgentChatItem, type AgentModel, type AgentPanelTab } from "@canvas/stores/use-agent-store";
import { useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import {
    encodeChannelModel,
    guessCapability,
    modelOptionName,
    selectableModelsByCapability,
    useConfigStore,
    useEffectiveConfig,
} from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { SmartImage } from "@/components/smart-image";

const MAX_BUILTIN_ATTACHMENTS = 8;

/**
 * Built-in ReAct agent: Base URL + API Key, canvas tools, context, multi-turn local history.
 */
export function BuiltinAgentPanel() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id: projectId = "default" } = useParams();
    const { logo, brandName } = useCanvasHost();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const { prompt, sending, waiting, messages, activeTab, attachments } = useAgentStore();
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const objectStorage = useConfigStore((state) => state.objectStorage);
    const loadBuiltinSkills = useBuiltinSkillStore((state) => state.load);
    const builtinSkills = useBuiltinSkillStore((state) => state.skills);
    const selectedBuiltinName = useBuiltinSkillStore((state) => state.selectedName);
    const abortRef = useRef<AbortController | null>(null);
    const [threads, setThreads] = useState<BuiltinAgentThread[]>(() => loadBuiltinAgentThreads(projectId));
    const [activeThreadId, setActiveThreadId] = useState(() => {
        const loaded = loadBuiltinAgentThreads(projectId);
        return loaded[0]?.id || randomId();
    });
    const [sessionsOpen, setSessionsOpen] = useState(false);
    const hydratedRef = useRef(false);

    const textModels = useMemo(() => {
        const listed = selectableModelsByCapability(config, "text");
        if (listed.length) return listed;
        return config.channels.flatMap((channel) =>
            channel.models
                .filter((model) => model.capability === "text" || guessCapability(model.name) === "text")
                .map((model) => encodeChannelModel(channel.id, model.name)),
        );
    }, [config]);
    const textModel = useMemo(() => {
        if (config.textModel && textModels.includes(config.textModel)) return config.textModel;
        if (config.model && textModels.includes(config.model)) return config.model;
        return textModels[0] || "";
    }, [config.model, config.textModel, textModels]);
    const ready = Boolean(textModel) && isAiConfigReady(config, textModel);

    useEffect(() => {
        const loaded = loadBuiltinAgentThreads(projectId);
        setThreads(loaded);
        const nextId = loaded[0]?.id || randomId();
        setActiveThreadId(nextId);
        setAgentState({
            messages: loaded[0]?.messages || [],
            prompt: "",
            activeTab: "chat",
            connectError: "",
        });
        hydratedRef.current = true;
        void loadBuiltinSkills();
    }, [loadBuiltinSkills, projectId, setAgentState]);

    useEffect(() => {
        if (!hydratedRef.current || sending || waiting || !messages.length) return;
        const thread: BuiltinAgentThread = {
            id: activeThreadId,
            title: titleFromMessages(messages, t("agent.history.untitled")),
            updatedAt: Date.now(),
            messages,
        };
        setThreads(upsertBuiltinAgentThread(projectId, thread));
    }, [activeThreadId, messages, projectId, sending, t, waiting]);

    useEffect(() => {
        if (!textModel) return;
        if (config.textModel === textModel) return;
        updateConfig("textModel", textModel);
        if (!config.model || !textModels.includes(config.model)) {
            updateConfig("model", textModel);
        }
    }, [config.model, config.textModel, textModel, textModels, updateConfig]);

    const composerModels = useMemo<AgentModel[]>(
        () =>
            textModels.map((value) => {
                const name = modelOptionName(value);
                return {
                    id: value,
                    model: value,
                    displayName: name,
                    defaultReasoningEffort: "medium" as const,
                    supportedReasoningEfforts: [],
                };
            }),
        [textModels],
    );

    useEffect(() => {
        setAgentState({
            connected: ready,
            enabled: ready,
            activity: ready ? (textModel ? modelOptionName(textModel) : "") : "",
            connectError: "",
        });
    }, [ready, setAgentState, textModel]);

    const stopTurn = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        const latest = useAgentStore.getState().messages;
        setAgentState({
            sending: false,
            waiting: false,
            messages: latest.map((item) => (item.streamId ? { ...item, streamId: undefined } : item)),
        });
    };

    const persistCurrentThread = (nextMessages = messages) => {
        if (!nextMessages.length) return;
        const thread: BuiltinAgentThread = {
            id: activeThreadId,
            title: titleFromMessages(nextMessages, t("agent.history.untitled")),
            updatedAt: Date.now(),
            messages: nextMessages,
        };
        setThreads(upsertBuiltinAgentThread(projectId, thread));
    };

    const startNewThread = () => {
        stopTurn();
        persistCurrentThread();
        const nextId = randomId();
        setActiveThreadId(nextId);
        setSessionsOpen(false);
        setAgentState({ messages: [], prompt: "", attachments: [], connectError: "", activeTab: "chat" });
    };

    const resumeThread = (threadId: string) => {
        setSessionsOpen(false);
        if (threadId === activeThreadId) {
            setAgentState({ activeTab: "chat" });
            return;
        }
        stopTurn();
        persistCurrentThread();
        const thread = threads.find((item) => item.id === threadId);
        setActiveThreadId(threadId);
        setAgentState({
            messages: thread?.messages || [],
            prompt: "",
            attachments: [],
            connectError: "",
            activeTab: "chat",
        });
    };

    const removeThread = (threadId: string) => {
        stopTurn();
        const next = deleteBuiltinAgentThread(projectId, threadId);
        setThreads(next);
        if (threadId !== activeThreadId) return;
        const fallback = next[0];
        const nextId = fallback?.id || randomId();
        setActiveThreadId(nextId);
        setAgentState({
            messages: fallback?.messages || [],
            prompt: "",
            attachments: [],
            connectError: "",
            activeTab: "chat",
        });
    };

    const changeModel = (next: string) => {
        updateConfig("textModel", next);
        updateConfig("model", next);
    };

    const requireObjectStorage = () => {
        if (isObjectStorageConfigured(objectStorage)) return true;
        message.warning(t("agent.composer.objectStorageRequired"));
        openConfigDialog(false, "object-storage");
        return false;
    };

    const addAttachments = async (files: FileList | File[] | null) => {
        if (!files?.length) return;
        if (!requireObjectStorage()) return;
        const prev = useAgentStore.getState().attachments;
        const room = Math.max(0, MAX_BUILTIN_ATTACHMENTS - prev.length);
        if (!room) {
            message.warning(t("agent.composer.attachmentLimit", { count: MAX_BUILTIN_ATTACHMENTS }));
            return;
        }
        const incoming = Array.from(files).slice(0, room);
        if (incoming.length < Array.from(files).length) {
            message.warning(t("agent.composer.attachmentLimit", { count: MAX_BUILTIN_ATTACHMENTS }));
        }
        const hide = message.loading(t("agent.composer.uploadingAttachments"), 0);
        try {
            const uploaded: AgentAttachment[] = [];
            for (const file of incoming) {
                assertCanvasMediaUploadSize(file.size, file.type, file.name, MAX_CANVAS_UPLOAD_BYTES);
                const result = await uploadToConfiguredObjectStorage(objectStorage, file, {
                    filename: file.name,
                    contentType: file.type || undefined,
                });
                let width = 0;
                let height = 0;
                if ((result.mimeType || file.type).startsWith("image/")) {
                    try {
                        const meta = await readImageMeta(result.accessUrl);
                        width = meta.width;
                        height = meta.height;
                    } catch {
                        // Vision meta is optional for chat attachments.
                    }
                }
                uploaded.push({
                    id: randomId(),
                    name: file.name,
                    type: result.mimeType || file.type || "application/octet-stream",
                    size: result.bytes || file.size,
                    width,
                    height,
                    url: result.accessUrl,
                    dataUrl: result.accessUrl,
                });
            }
            if (uploaded.length) setAgentState({ attachments: [...prev, ...uploaded] });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("agent.composer.uploadFailed"));
        } finally {
            hide();
        }
    };

    const removeAttachment = (id: string) => {
        setAgentState({ attachments: useAgentStore.getState().attachments.filter((item) => item.id !== id) });
    };

    const sendPrompt = async (overrideText?: string) => {
        const text = (overrideText ?? prompt).trim();
        const files = useAgentStore.getState().attachments;
        if ((!text && !files.length) || sending || waiting) return;
        if (!ready || !textModel) {
            openConfigDialog(false, "channels");
            message.warning(t("agent.connect.configureAiFirst"));
            setAgentState({ activeTab: "chat" });
            return;
        }
        if (files.length && !requireObjectStorage()) return;

        const selectedSkill = builtinSkills.find((skill) => skill.name === selectedBuiltinName);
        const displayText =
            text ||
            t(files.some((item) => item.type.startsWith("image/")) ? "agent.runtime.imagesSent" : "agent.runtime.attachmentCount", {
                count: files.length,
            });
        const userMessage: AgentChatItem = {
            id: randomId(),
            role: "user",
            text: displayText,
            threadId: activeThreadId,
            attachments: files.map(({ id, name, url, type, size, width, height, dataUrl }) => ({
                id,
                name,
                url,
                type,
                size,
                width,
                height,
                dataUrl,
            })),
            skill: selectedSkill
                ? { name: selectedSkill.name, path: selectedSkill.path, displayName: selectedSkill.name }
                : undefined,
        };
        const history = [...messages]
            .filter((item) => item.role === "user" || item.role === "assistant")
            .map((item) => ({ role: item.role as "user" | "assistant", content: item.text }));

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setAgentState({
            prompt: "",
            attachments: [],
            sending: true,
            waiting: true,
            messages: [...messages, userMessage],
            connectError: "",
            activity: t("agent.panel.builtinStreaming"),
            activeTab: "chat",
        });

        try {
            const canvasContext = useAgentStore.getState().canvasContext;
            await runBuiltinAgentHarness({
                config: { ...config, model: textModel, textModel },
                history,
                userText: text,
                attachments: files,
                canvasContext,
                navigate,
                signal: controller.signal,
                handlers: {
                    onAssistantDelta: (assistantId, delta) => {
                        if (!delta.trim()) return;
                        const latest = useAgentStore.getState().messages;
                        const exists = latest.some((item) => item.id === assistantId);
                        setAgentState({
                            messages: exists
                                ? latest.map((item) =>
                                      item.id === assistantId
                                          ? { ...item, text: delta, streamId: assistantId, threadId: activeThreadId }
                                          : item,
                                  )
                                : [
                                      ...latest,
                                      {
                                          id: assistantId,
                                          role: "assistant",
                                          text: delta,
                                          streamId: assistantId,
                                          threadId: activeThreadId,
                                      },
                                  ],
                        });
                    },
                    onAssistantFinalize: (assistantId, finalText) => {
                        const latest = useAgentStore.getState().messages;
                        const trimmed = finalText.trim();
                        if (!trimmed) {
                            // Tool-only rounds shouldn't leave empty assistant bubbles.
                            setAgentState({
                                messages: latest.filter((item) => item.id !== assistantId),
                            });
                            return;
                        }
                        const exists = latest.some((item) => item.id === assistantId);
                        setAgentState({
                            messages: exists
                                ? latest.map((item) =>
                                      item.id === assistantId
                                          ? { ...item, text: trimmed, streamId: undefined }
                                          : item,
                                  )
                                : [
                                      ...latest,
                                      {
                                          id: assistantId,
                                          role: "assistant",
                                          text: trimmed,
                                          threadId: activeThreadId,
                                      },
                                  ],
                        });
                    },
                    onToolStart: (item) => {
                        const latest = useAgentStore.getState().messages;
                        // Drop empty streaming placeholders left from the previous model turn.
                        const cleaned = latest.filter((entry) => !(entry.role === "assistant" && !entry.text?.trim()));
                        setAgentState({
                            messages: [...cleaned, { ...item, threadId: activeThreadId }],
                            activity: item.title || item.text,
                        });
                    },
                    onToolFinish: (itemId, patch) => {
                        const latest = useAgentStore.getState().messages;
                        setAgentState({
                            messages: latest.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
                        });
                    },
                    onActivity: (value) => setAgentState({ activity: value }),
                },
            });
            const finalized = useAgentStore.getState().messages;
            setAgentState({
                sending: false,
                waiting: false,
                activity: textModel ? modelOptionName(textModel) : "",
            });
            persistCurrentThread(finalized);
        } catch (error) {
            if (controller.signal.aborted) {
                setAgentState({ sending: false, waiting: false, activity: textModel ? modelOptionName(textModel) : "" });
                return;
            }
            const errText = friendlyAgentError(error, t("apiErrors.networkRequestFailed"));
            const latest = useAgentStore.getState().messages;
            // If a previous assistant stream already wrote "Load failed", replace it with a clear error card.
            const cleaned = latest.map((item) =>
                item.role === "assistant" && isRawNetworkFailureText(item.text)
                    ? { ...item, text: t("agent.message.interruptedByNetwork") }
                    : item,
            );
            const withError: AgentChatItem[] = [
                ...cleaned,
                { id: randomId(), role: "error", text: errText, threadId: activeThreadId },
            ];
            const draft = useAgentStore.getState();
            setAgentState({
                messages: withError,
                sending: false,
                waiting: false,
                connectError: errText,
                activity: t("agent.status.failed"),
                // Restore draft if user hasn't started a new one during the failed turn.
                ...(draft.prompt || draft.attachments.length ? {} : { prompt: text, attachments: files }),
            });
            persistCurrentThread(withError);
            message.error(errText);
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    useEffect(() => () => abortRef.current?.abort(), []);

    const conversationTitle = useMemo(() => {
        const saved = threads.find((item) => item.id === activeThreadId)?.title;
        if (saved && messages.length) return saved;
        return titleFromMessages(messages, t("agent.runtime.newConversation"));
    }, [activeThreadId, messages, t, threads]);
    const sessionRows = useMemo(() => {
        const listed = [...threads];
        if (!listed.some((item) => item.id === activeThreadId)) {
            listed.unshift({
                id: activeThreadId,
                title: t("agent.runtime.newConversation"),
                updatedAt: Date.now(),
                messages: [],
            });
        }
        return listed;
    }, [activeThreadId, t, threads]);
    const panelTab: AgentPanelTab = activeTab === "skills" ? "skills" : "chat";

    return (
        <>
            <AgentPanelTabs
                value={panelTab}
                theme={theme}
                leading={
                    <Tooltip title={brandName || t("agent.panel.brandName")} placement="bottom">
                        <span
                            className="grid size-8 place-items-center overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10"
                            style={{ background: theme.toolbar.activeBg }}
                            aria-label={brandName || t("agent.panel.brandName")}
                        >
                            <SmartImage src={logo} alt="" className="size-5 object-contain" fallbackIconClassName="size-3.5" />
                        </span>
                    </Tooltip>
                }
                center={
                    <Popover
                        trigger="click"
                        placement="bottomLeft"
                        open={sessionsOpen}
                        onOpenChange={setSessionsOpen}
                        arrow={false}
                        content={
                            <div className="w-[280px]">
                                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                    <div className="text-xs" style={{ color: theme.node.muted }}>
                                        {sessionRows.length
                                            ? t("agent.history.count", { count: sessionRows.length })
                                            : t("agent.history.empty")}
                                    </div>
                                    <Button
                                        size="small"
                                        type="text"
                                        className="!h-7"
                                        icon={<Plus className="size-3.5" />}
                                        disabled={sending || waiting}
                                        onClick={startNewThread}
                                    >
                                        {t("agent.history.newThread")}
                                    </Button>
                                </div>
                                <div className="thin-scrollbar max-h-72 space-y-1 overflow-y-auto">
                                    {sessionRows.map((thread) => {
                                        const active = thread.id === activeThreadId;
                                        return (
                                            <div
                                                key={thread.id}
                                                className="group flex items-start gap-1 rounded-xl px-2 py-2 transition hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                                                style={{
                                                    background: active ? theme.toolbar.activeBg : "transparent",
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="min-w-0 flex-1 text-left"
                                                    onClick={() => resumeThread(thread.id)}
                                                >
                                                    <div className="truncate text-sm font-medium leading-5">{thread.title}</div>
                                                    <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: theme.node.muted }}>
                                                        {new Date(thread.updatedAt).toLocaleString()}
                                                        {active ? ` · ${t("agent.history.current")}` : ""}
                                                    </div>
                                                </button>
                                                {threads.some((item) => item.id === thread.id) ? (
                                                    <button
                                                        type="button"
                                                        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                                        style={{ color: theme.node.muted }}
                                                        aria-label={t("agent.history.deleteCount", { count: 1 })}
                                                        onClick={() => removeThread(thread.id)}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        }
                    >
                        <button
                            type="button"
                            className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                            aria-label={t("agent.history.selectThread", { name: conversationTitle })}
                        >
                            <MessageSquare className="size-3.5 shrink-0 opacity-55" />
                            <span className="min-w-0 truncate text-sm font-medium leading-5">{conversationTitle}</span>
                            <ChevronDown className="size-3.5 shrink-0 opacity-45" />
                        </button>
                    </Popover>
                }
                items={[]}
                onChange={() => undefined}
                right={
                    <>
                        <nav className="mr-1 flex items-center gap-0.5 text-sm" role="tablist" aria-label={t("agent.panel.content")}>
                            {(
                                [
                                    { value: "chat" as const, label: t("agent.panel.chat"), icon: <MessageSquare className="size-3.5" /> },
                                    {
                                        value: "skills" as const,
                                        label: t("agent.panel.skills"),
                                        icon: <Sparkles className="size-3.5" />,
                                        count: builtinSkills.length || undefined,
                                    },
                                ] as const
                            ).map((item) => {
                                const active = panelTab === item.value;
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 transition"
                                        style={{
                                            background: active ? theme.toolbar.activeBg : "transparent",
                                            color: active ? theme.node.text : theme.node.muted,
                                            fontWeight: active ? 600 : 400,
                                        }}
                                        onClick={() => setAgentState({ activeTab: item.value })}
                                    >
                                        {item.icon}
                                        <span>{item.label}</span>
                                        {"count" in item && item.count ? (
                                            <span className="text-[10px] tabular-nums opacity-60">{item.count > 99 ? "99+" : item.count}</span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </nav>
                        <Tooltip title={t("agent.history.newThread")} placement="bottom">
                            <Button
                                size="small"
                                type="text"
                                className="!h-8 !w-8 !min-w-8 !px-0"
                                aria-label={t("agent.history.newThread")}
                                disabled={sending || waiting}
                                icon={<Plus className="size-3.5" />}
                                onClick={startNewThread}
                            />
                        </Tooltip>
                    </>
                }
            />

            {panelTab === "skills" ? (
                <BuiltinAgentSkillsView />
            ) : (
                <>
                    <AgentChatTimeline
                        theme={theme}
                        pendingTool={null}
                        pendingApprovals={[]}
                        sending={sending}
                        waiting={waiting}
                        onRejectTool={() => undefined}
                        onApproveTool={() => undefined}
                        onApprovalDecision={() => undefined}
                        emptyState={
                            <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-10 text-center">
                                <div
                                    className="mb-4 grid size-12 place-items-center overflow-hidden rounded-2xl ring-1 ring-black/5 dark:ring-white/10"
                                    style={{ background: theme.toolbar.activeBg, color: theme.node.text }}
                                >
                                    <SmartImage src={logo} alt="" className="size-7 object-contain" fallbackIconClassName="size-5" />
                                </div>
                                <div className="text-base font-semibold leading-6">{t("agent.chat.emptyTitle")}</div>
                                <div className="mt-1.5 max-w-[280px] text-sm leading-5" style={{ color: theme.node.muted }}>
                                    {ready ? t("agent.chat.emptyHint") : t("agent.connect.configureAiFirst")}
                                </div>
                                {!ready ? (
                                    <Button
                                        className="mt-5"
                                        type="primary"
                                        icon={<Settings2 className="size-4" />}
                                        onClick={() => openConfigDialog(false, "channels")}
                                    >
                                        {t("agent.connect.openAiConfig")}
                                    </Button>
                                ) : null}
                            </div>
                        }
                    />
                    <div
                        className="shrink-0 border-t px-1 pb-1 pt-2"
                        style={{ borderColor: `${theme.node.stroke}55`, background: theme.toolbar.panel }}
                    >
                        <AgentChatComposer
                            prompt={prompt}
                            attachments={attachments.map(({ id, name, url, type }) => ({ id, name, url, type }))}
                            disabled={!ready}
                            sending={sending || waiting}
                            placeholder={
                                ready ? t("agent.panel.placeholderBuiltinMention") : t("agent.connect.configureAiFirst")
                            }
                            theme={theme}
                            models={composerModels}
                            model={textModel || composerModels[0]?.model}
                            onModelChange={changeModel}
                            onPromptChange={(next) => setAgentState({ prompt: next })}
                            onSubmit={() => void sendPrompt()}
                            onStop={stopTurn}
                            onAddFiles={addAttachments}
                            onRemoveAttachment={removeAttachment}
                        />
                    </div>
                </>
            )}
        </>
    );
}

function isRawNetworkFailureText(text?: string) {
    const value = (text || "").trim().toLowerCase();
    if (!value) return false;
    return (
        value === "load failed" ||
        value.includes("network connection was lost") ||
        value.includes("failed to fetch") ||
        value.includes("networkerror") ||
        value.includes("err_network")
    );
}

function friendlyAgentError(error: unknown, fallback: string) {
    const raw = error instanceof Error ? error.message : String(error || "");
    if (isRawNetworkFailureText(raw)) return fallback;
    return raw || fallback;
}
