import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Tooltip } from "antd";
import {
    Bot,
    History,
    MessageSquare,
    PanelRightClose,
    Plus,
    Settings2,
    Sparkles,
    Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { AgentChatTimeline } from "./agent-chat";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentConnectView } from "./agent-connect-view";
import { AgentPanelTabs } from "./agent-panel-tabs";
import { runBuiltinAgentHarness } from "@canvas/lib/agent/builtin-agent-harness";
import {
    deleteBuiltinAgentThread,
    loadBuiltinAgentThreads,
    titleFromMessages,
    upsertBuiltinAgentThread,
    type BuiltinAgentThread,
} from "@canvas/lib/canvas/builtin-agent-threads";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { randomId } from "@canvas/lib/utils";
import { useAgentStore, type AgentChatItem, type AgentModel } from "@canvas/stores/use-agent-store";
import {
    encodeChannelModel,
    guessCapability,
    modelOptionName,
    resolveModelChannel,
    selectableModelsByCapability,
    useConfigStore,
    useEffectiveConfig,
} from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { getDefaultChannel } from "@canvas/integration/gateway-utils";
import { syncGatewayModels } from "@canvas/integration/sync-gateway-models";

/**
 * Built-in ReAct agent: Base URL + API Key, canvas tools, context, multi-turn local history.
 */
export function BuiltinAgentPanel() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id: projectId = "default" } = useParams();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const { prompt, sending, waiting, activeTab, activity, messages } = useAgentStore();
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const closePanel = useAgentStore((state) => state.closePanel);
    const abortRef = useRef<AbortController | null>(null);
    const [syncingModels, setSyncingModels] = useState(false);
    const didSyncModelsRef = useRef(false);
    const [threads, setThreads] = useState<BuiltinAgentThread[]>(() => loadBuiltinAgentThreads(projectId));
    const [activeThreadId, setActiveThreadId] = useState(() => {
        const loaded = loadBuiltinAgentThreads(projectId);
        return loaded[0]?.id || randomId();
    });
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
    const channel = textModel ? resolveModelChannel(config, textModel) : getDefaultChannel(config) || null;

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
    }, [projectId, setAgentState]);

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
        if (textModels.length || didSyncModelsRef.current || syncingModels) return;
        const apiKey = (channel?.apiKey || config.apiKey || "").trim();
        if (!apiKey) return;
        didSyncModelsRef.current = true;
        let cancelled = false;
        setSyncingModels(true);
        void syncGatewayModels(apiKey, true)
            .catch(() => false)
            .finally(() => {
                if (!cancelled) setSyncingModels(false);
            });
        return () => {
            cancelled = true;
        };
    }, [channel?.apiKey, config.apiKey, syncingModels, textModels.length]);

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

    const channelLabel = useMemo(() => {
        if (!ready) return syncingModels ? t("agent.connect.syncingModels") : t("agent.connect.aiNotReady");
        return modelOptionName(textModel) || t("agent.connect.aiReady");
    }, [ready, syncingModels, t, textModel]);

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
        setAgentState({ messages: [], prompt: "", connectError: "", activeTab: "chat" });
    };

    const resumeThread = (threadId: string) => {
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
            connectError: "",
            activeTab: "chat",
        });
    };

    const changeModel = (next: string) => {
        updateConfig("textModel", next);
        updateConfig("model", next);
    };

    const sendPrompt = async (overrideText?: string) => {
        const text = (overrideText ?? prompt).trim();
        if (!text || sending || waiting) return;
        if (!ready || !textModel) {
            openConfigDialog(false, "channels");
            message.warning(t("agent.connect.configureAiFirst"));
            setAgentState({ activeTab: "setup" });
            return;
        }

        const userMessage: AgentChatItem = {
            id: randomId(),
            role: "user",
            text,
            threadId: activeThreadId,
        };
        const history = [...messages]
            .filter((item) => item.role === "user" || item.role === "assistant")
            .map((item) => ({ role: item.role as "user" | "assistant", content: item.text }));

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setAgentState({
            prompt: "",
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
                canvasContext,
                navigate,
                signal: controller.signal,
                handlers: {
                    onAssistantDelta: (assistantId, delta) => {
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
                        setAgentState({
                            messages: latest.map((item) =>
                                item.id === assistantId
                                    ? { ...item, text: finalText || item.text, streamId: undefined }
                                    : item,
                            ),
                        });
                    },
                    onToolStart: (item) => {
                        const latest = useAgentStore.getState().messages;
                        setAgentState({
                            messages: [...latest, { ...item, threadId: activeThreadId }],
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
            const errText = error instanceof Error ? error.message : t("agent.state.requestFailed");
            const latest = useAgentStore.getState().messages;
            const withError: AgentChatItem[] = [
                ...latest,
                { id: randomId(), role: "error", text: errText, threadId: activeThreadId },
            ];
            setAgentState({
                messages: withError,
                sending: false,
                waiting: false,
                connectError: errText,
                activity: t("agent.status.failed"),
            });
            persistCurrentThread(withError);
            message.error(errText);
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
        }
    };

    useEffect(() => () => abortRef.current?.abort(), []);

    const statusText = channelLabel || t("agent.status.disconnected");
    const conversationTitle = useMemo(
        () => titleFromMessages(messages, t("agent.runtime.newConversation")),
        [messages, t],
    );
    const suggestions = useMemo(
        () => [
            t("agent.chat.suggestions.storyboard"),
            t("agent.chat.suggestions.prompt"),
            t("agent.chat.suggestions.shotList"),
            t("agent.chat.suggestions.review"),
        ],
        [t],
    );
    const tabValue = activeTab === "setup" || activeTab === "history" ? activeTab : "chat";

    return (
        <>
            <AgentPanelTabs
                value={tabValue}
                theme={theme}
                leading={
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span
                            className="grid size-8 place-items-center rounded-lg"
                            style={{ background: theme.toolbar.activeBg }}
                        >
                            <Bot className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold leading-4">{t("agent.panel.brandName")}</div>
                            <div className="hidden truncate text-[11px] leading-4 @min-[480px]:block" style={{ color: theme.node.muted }}>
                                {messages.length ? conversationTitle : statusText}
                            </div>
                        </div>
                    </div>
                }
                items={[
                    { value: "chat", label: t("agent.panel.chat"), icon: <MessageSquare className="size-3.5" /> },
                    { value: "history", label: t("agent.panel.history"), icon: <History className="size-3.5" />, count: threads.length },
                    { value: "setup", label: t("agent.connect.settingsTab"), icon: <Settings2 className="size-3.5" /> },
                ]}
                onChange={(next) => setAgentState({ activeTab: next })}
                right={
                    <>
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
                        <Tooltip title={t("agent.panel.collapse")}>
                            <Button
                                type="text"
                                shape="circle"
                                className="!h-8 !w-8 !min-w-8"
                                aria-label={t("agent.panel.collapseLabel")}
                                style={{ color: theme.node.muted }}
                                icon={<PanelRightClose className="size-4" />}
                                onClick={closePanel}
                            />
                        </Tooltip>
                    </>
                }
            />

            {tabValue === "setup" ? (
                <AgentConnectView
                    theme={theme}
                    connected={ready}
                    activity={activity}
                    connectError=""
                    onToggleEnabled={() => openConfigDialog(false, "channels")}
                    builtin
                    baseUrl={channel?.baseUrl || config.baseUrl || ""}
                    channelName={channel?.name || ""}
                    modelLabel={textModel ? modelOptionName(textModel) : ""}
                />
            ) : tabValue === "history" ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-sm" style={{ color: theme.node.muted }}>
                            {threads.length
                                ? t("agent.history.count", { count: threads.length })
                                : t("agent.history.empty")}
                        </div>
                        <Button size="small" type="primary" icon={<Plus className="size-3.5" />} disabled={sending || waiting} onClick={startNewThread}>
                            {t("agent.history.newThread")}
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {threads.map((thread) => {
                            const active = thread.id === activeThreadId;
                            return (
                                <div
                                    key={thread.id}
                                    className="group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                                    style={{
                                        borderColor: active ? theme.node.text : theme.node.stroke,
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
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        className="!h-7 !w-7 !min-w-7 opacity-0 group-hover:opacity-100"
                                        icon={<Trash2 className="size-3.5" />}
                                        aria-label={t("agent.history.deleteCount", { count: 1 })}
                                        onClick={() => removeThread(thread.id)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
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
                                    className="mb-4 grid size-12 place-items-center rounded-2xl"
                                    style={{ background: theme.toolbar.activeBg, color: theme.node.text }}
                                >
                                    <Sparkles className="size-5" />
                                </div>
                                <div className="text-base font-semibold leading-6">{t("agent.chat.emptyTitle")}</div>
                                <div className="mt-1.5 max-w-[280px] text-sm leading-5" style={{ color: theme.node.muted }}>
                                    {ready ? t("agent.chat.emptyHint") : t("agent.connect.configureAiFirst")}
                                </div>
                                {ready ? (
                                    <div className="mt-5 flex w-full max-w-[340px] flex-col gap-2">
                                        {suggestions.map((item) => (
                                            <button
                                                key={item}
                                                type="button"
                                                className="rounded-xl border px-3.5 py-2.5 text-left text-sm leading-5 transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                                                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                                                onClick={() => void sendPrompt(item)}
                                            >
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <Button
                                        className="mt-5"
                                        type="primary"
                                        icon={<Settings2 className="size-4" />}
                                        onClick={() => {
                                            openConfigDialog(false, "channels");
                                            setAgentState({ activeTab: "setup" });
                                        }}
                                    >
                                        {t("agent.connect.openAiConfig")}
                                    </Button>
                                )}
                            </div>
                        }
                    />
                    <div className="shrink-0 px-1 pb-1 pt-1">
                        <AgentChatComposer
                            prompt={prompt}
                            disabled={!ready}
                            sending={sending || waiting}
                            placeholder={
                                ready
                                    ? t("agent.panel.placeholderBuiltin")
                                    : syncingModels
                                      ? t("agent.connect.syncingModels")
                                      : t("agent.connect.configureAiFirst")
                            }
                            theme={theme}
                            models={composerModels}
                            model={textModel || composerModels[0]?.model}
                            onModelChange={changeModel}
                            onPromptChange={(next) => setAgentState({ prompt: next })}
                            onSubmit={() => void sendPrompt()}
                            onStop={stopTurn}
                        />
                    </div>
                </>
            )}
        </>
    );
}
