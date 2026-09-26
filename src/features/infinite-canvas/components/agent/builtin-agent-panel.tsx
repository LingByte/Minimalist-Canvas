import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App, Button, Dropdown, Tooltip } from "antd";
import { Bot, History, MessageSquare, PanelRightClose, PlugZap, Plus, Settings2, Sparkles, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentChatTimeline } from "./agent-chat";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentConnectView } from "./agent-connect-view";
import { AgentMcpSettings } from "./agent-mcp-settings";
import { AgentPanelTabs } from "./agent-panel-tabs";
import { BuiltinAgentHistoryView } from "./builtin-agent-history-view";
import { toolCallDetail, toolName, toolSummary } from "./agent-event-formatters";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { randomId } from "@canvas/lib/utils";
import { builtinAgentSystemPrompt, builtinAgentTools, runBuiltinAgentTool, toolResultText } from "@canvas/lib/agent/builtin-agent-tools";
import { describeToolsForReAct, parseReActActions, reactSystemPrompt, stripReActBlocks } from "@canvas/lib/agent/react-parser";
import { applyBuiltinThread, builtinSession, deleteBuiltinThread, flushBuiltinSession, listBuiltinThreads, loadBuiltinThread, persistBuiltinSession, resetBuiltinSession, restoreLatestBuiltinSession, type BuiltinThreadSummary } from "@canvas/lib/agent/builtin-agent-session";
import { requestAgentChatCompletion, type AgentToolCall } from "@canvas/services/api/image";
import { selectedBuiltinSkillPrompt, useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import { useMcpClientStore } from "@canvas/stores/use-mcp-client-store";
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

const MAX_TOOL_ROUNDS = 8;

function parseToolArguments(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

/**
 * Built-in side-panel chat: uses the user's channel Base URL + API Key.
 * Does not depend on external Canvas Agent / SSE.
 */
export function BuiltinAgentPanel() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const {
        prompt,
        sending,
        waiting,
        activeTab,
        activity,
    } = useAgentStore();
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const closePanel = useAgentStore((state) => state.closePanel);
    const abortRef = useRef<AbortController | null>(null);
    const [streamId, setStreamId] = useState("");
    const [syncingModels, setSyncingModels] = useState(false);
    const [threads, setThreads] = useState<BuiltinThreadSummary[]>([]);
    const [activeThreadId, setActiveThreadId] = useState(builtinSession.threadId);
    const didSyncModelsRef = useRef(false);
    const skills = useBuiltinSkillStore((state) => state.skills);
    const selectedSkillName = useBuiltinSkillStore((state) => state.selectedName);
    const loadSkills = useBuiltinSkillStore((state) => state.load);
    const selectSkill = useBuiltinSkillStore((state) => state.select);

    const textModels = useMemo(() => {
        const listed = selectableModelsByCapability(config, "text");
        if (listed.length) return listed;
        // Catalog may omit capability labels; fall back to name heuristics.
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

    // Pull gateway models once when the chat panel has no text model yet.
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

    // Persist the resolved default so workbenches and reconnect share the same text model.
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
                const ch = resolveModelChannel(config, value);
                const name = modelOptionName(value);
                return {
                    id: value,
                    model: value,
                    displayName: ch.name ? `${name} 路 ${ch.name}` : name,
                    defaultReasoningEffort: "medium" as const,
                    supportedReasoningEfforts: [],
                };
            }),
        [config, textModels],
    );

    useEffect(() => {
        setAgentState({
            connected: ready,
            enabled: ready,
            activity: ready ? (textModel ? modelOptionName(textModel) : "") : "",
            // Keep connectError empty for "not configured" 鈥?status UI should not say 杩炴帴澶辫触.
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
        setAgentState({ sending: false, waiting: false });
        setStreamId("");
    };

    const getMessages = () => useAgentStore.getState().messages;

    const startNewThread = () => {
        stopTurn();
        flushBuiltinSession(getMessages);
        resetBuiltinSession();
        setActiveThreadId(builtinSession.threadId);
        setAgentState({ messages: [], prompt: "", connectError: "", activeTab: "chat" });
        void listBuiltinThreads().then(setThreads);
    };

    const refreshThreads = () => void listBuiltinThreads().then(setThreads);

    const openThread = (id: string) => {
        if (id === activeThreadId) {
            setAgentState({ activeTab: "chat" });
            return;
        }
        stopTurn();
        flushBuiltinSession(getMessages);
        void loadBuiltinThread(id).then((thread) => {
            if (!thread) return;
            const restored = applyBuiltinThread(thread);
            setActiveThreadId(thread.id);
            setAgentState({ messages: restored, prompt: "", connectError: "", activeTab: "chat" });
        });
    };

    const deleteThreads = (ids: string[]) => {
        const removingCurrent = ids.includes(builtinSession.threadId);
        void Promise.all(ids.map((id) => deleteBuiltinThread(id))).then(() => {
            if (removingCurrent) {
                resetBuiltinSession();
                setActiveThreadId(builtinSession.threadId);
                setAgentState({ messages: [] });
            }
            refreshThreads();
        });
    };

    // Restore the latest conversation once, and load local skills.
    useEffect(() => {
        if (builtinSession.hydrated) {
            setActiveThreadId(builtinSession.threadId);
            void listBuiltinThreads().then(setThreads);
            return;
        }
        void restoreLatestBuiltinSession().then((restored) => {
            setActiveThreadId(builtinSession.threadId);
            if (restored.length && !useAgentStore.getState().messages.length) {
                setAgentState({ messages: restored });
            }
        });
        void listBuiltinThreads().then(setThreads);
        void loadSkills();
        void useMcpClientStore.getState().connectAll();
    }, [loadSkills, setAgentState]);

    // Refresh the thread list whenever the history tab opens.
    useEffect(() => {
        if (activeTab === "history") refreshThreads();
    }, [activeTab]);

    const changeModel = (next: string) => {
        updateConfig("textModel", next);
        updateConfig("model", next);
    };

    const sendPrompt = async () => {
        const text = prompt.trim();
        if (!text || sending || waiting) return;
        if (!ready || !textModel) {
            openConfigDialog(false, "channels");
            message.warning(t("agent.connect.configureAiFirst"));
            setAgentState({ activeTab: "setup" });
            return;
        }

        const userMessage: AgentChatItem = { id: randomId(), role: "user", text };
        const nextStreamId = randomId();
        const canvasContext = useAgentStore.getState().canvasContext;
        const hasCanvas = Boolean(canvasContext?.snapshot);
        const tools = builtinAgentTools(hasCanvas);
        const requestConfig = {
            ...config,
            model: textModel,
            textModel,
            systemPrompt: [config.systemPrompt, builtinAgentSystemPrompt(hasCanvas), selectedBuiltinSkillPrompt()].filter(Boolean).join("\n\n"),
        };

        builtinSession.transcript.push({ role: "user", content: text });
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStreamId(nextStreamId);
        setAgentState({
            prompt: "",
            sending: true,
            waiting: true,
            messages: [...useAgentStore.getState().messages, userMessage],
            connectError: "",
            activity: t("agent.panel.builtinStreaming"),
        });

        /** Lazily append or update an assistant bubble for the current model call. */
        const pushAssistantDelta = (id: string, delta: string) => {
            const latest = useAgentStore.getState().messages;
            if (latest.some((item) => item.id === id)) {
                setAgentState({ messages: latest.map((item) => (item.id === id ? { ...item, text: delta, streamId: nextStreamId } : item)) });
            } else {
                setAgentState({ messages: [...latest, { id, role: "assistant" as const, text: delta, streamId: nextStreamId }] });
            }
        };
        /** Insert or update a tool-call card in the timeline. */
        const upsertToolMessage = (id: string, call: AgentToolCall, status: "inProgress" | "completed" | "failed", text: string, output = "") => {
            const detail = toolCallDetail(call.function.name, parseToolArguments(call.function.arguments), status, output);
            const latest = useAgentStore.getState().messages;
            const item: AgentChatItem = { id, role: "tool", title: toolName(call.function.name), text, detail };
            setAgentState({
                messages: latest.some((existing) => existing.id === id)
                    ? latest.map((existing) => (existing.id === id ? item : existing))
                    : [...latest, item],
            });
        };
        /** Insert or update the plan card (kind:"todo" is rendered by the task-progress bar, not inline). */
        const upsertPlanMessage = (tasks: Array<{ step: string; status: string }>, explanation = "") => {
            const status = tasks.length && tasks.every((task) => task.status === "completed" || task.status === "done") ? "completed" : "inProgress";
            const item: AgentChatItem = {
                id: "builtin-plan",
                role: "tool",
                title: t("agent.events.plan"),
                text: explanation || toolName("update_plan"),
                detail: { kind: "todo", tasks, status, explanation },
            };
            const latest = useAgentStore.getState().messages;
            setAgentState({
                messages: latest.some((existing) => existing.id === item.id)
                    ? latest.map((existing) => (existing.id === item.id ? item : existing))
                    : [...latest, item],
            });
        };
        /** Remove an assistant bubble that ended up empty (ReAct action-only output). */
        const removeMessage = (id: string) => {
            const latest = useAgentStore.getState().messages;
            setAgentState({ messages: latest.filter((item) => item.id !== id) });
        };
        const clearStreamFlags = () => {
            const latest = useAgentStore.getState().messages;
            setAgentState({ messages: latest.map((item) => (item.streamId === nextStreamId ? { ...item, streamId: undefined } : item)) });
        };
        const normalizePlanTasks = (value: unknown): Array<{ step: string; status: string }> =>
            Array.isArray(value)
                ? value
                      .map((task) => {
                          const record = task as Record<string, unknown>;
                          const step = typeof record?.step === "string" ? record.step : typeof record?.title === "string" ? record.title : "";
                          const status = typeof record?.status === "string" && ["pending", "inProgress", "completed", "failed", "done"].includes(record.status) ? record.status : "pending";
                          return step ? { step, status } : null;
                      })
                      .filter((task): task is { step: string; status: string } => Boolean(task))
                : [];
        const isToolUnsupportedError = (error: unknown) => {
            const text = error instanceof Error ? error.message : String(error);
            return /\b(tools?|function_call|function[s]?)\b.{0,80}(not|un)?support|unknown|invalid|unrecognized|400/i.test(text);
        };

        try {
            let rounds = 0;
            let reactMode = false;
            const callModel = async (onDelta: (text: string) => void) => {
                try {
                    return await requestAgentChatCompletion(
                        reactMode
                            ? { ...requestConfig, systemPrompt: `${requestConfig.systemPrompt}\n\n${reactSystemPrompt(describeToolsForReAct(tools))}` }
                            : requestConfig,
                        builtinSession.transcript,
                        reactMode ? [] : tools,
                        onDelta,
                        { signal: controller.signal },
                    );
                } catch (error) {
                    if (!reactMode && isToolUnsupportedError(error)) {
                        reactMode = true;
                        return callModel(onDelta);
                    }
                    throw error;
                }
            };

            for (;;) {
                const iterationId = randomId();
                let iterationText = "";
                const result = await callModel((delta) => {
                    iterationText = delta;
                    pushAssistantDelta(iterationId, delta);
                });

                // Native tool_calls, or ReAct "Action:" blocks parsed from plain text.
                let calls = result.toolCalls;
                let assistantVisible = result.content;
                if (!calls.length && result.content) {
                    const reactCalls = parseReActActions(result.content);
                    if (reactCalls.length) {
                        reactMode = true;
                        calls = reactCalls.map((call) => ({ id: randomId(), type: "function" as const, function: { name: call.name, arguments: JSON.stringify(call.args) } }));
                        assistantVisible = stripReActBlocks(result.content);
                        if (assistantVisible) pushAssistantDelta(iterationId, assistantVisible);
                        else if (useAgentStore.getState().messages.some((item) => item.id === iterationId)) removeMessage(iterationId);
                    }
                }

                if (!calls.length) {
                    if (reactMode && assistantVisible) assistantVisible = stripReActBlocks(assistantVisible) || assistantVisible;
                    if (assistantVisible && !iterationText) pushAssistantDelta(iterationId, assistantVisible);
                    else if (reactMode && assistantVisible && assistantVisible !== result.content && useAgentStore.getState().messages.some((item) => item.id === iterationId)) pushAssistantDelta(iterationId, assistantVisible);
                    if (assistantVisible) builtinSession.transcript.push({ role: "assistant", content: assistantVisible });
                    break;
                }

                rounds += 1;
                if (result.content) builtinSession.transcript.push({ role: "assistant", content: result.content });
                for (const call of calls) {
                    const callArgs = parseToolArguments(call.function.arguments);
                    const runningText = t("agent.eventMore.toolRunning", { action: toolName(call.function.name) });
                    const transcriptResult = (content: string) => {
                        if (reactMode) builtinSession.transcript.push({ role: "user", content: `Observation: ${content}` });
                        else builtinSession.transcript.push({ role: "tool", tool_call_id: call.id, content });
                    };
                    if (reactMode) {
                        builtinSession.transcript.push({ role: "assistant", content: `Action: ${call.function.name}\nAction Input: ${call.function.arguments}` });
                    } else {
                        builtinSession.transcript.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
                    }

                    if (call.function.name === "update_plan") {
                        upsertPlanMessage(normalizePlanTasks(callArgs.tasks), typeof callArgs.explanation === "string" ? callArgs.explanation : "");
                        transcriptResult(toolResultText({ ok: true }));
                        continue;
                    }

                    const toolItemId = randomId();
                    upsertToolMessage(toolItemId, call, "inProgress", runningText);
                    setAgentState({ activity: runningText });
                    try {
                        const output = await runBuiltinAgentTool(call.function.name, callArgs, navigate);
                        const outputText = toolResultText(output);
                        transcriptResult(outputText);
                        upsertToolMessage(toolItemId, call, "completed", toolSummary({ tool: call.function.name, arguments: call.function.arguments, result: output }) || runningText);
                    } catch (error) {
                        if (controller.signal.aborted) throw error;
                        const errText = error instanceof Error ? error.message : t("agent.state.requestFailed");
                        transcriptResult(`Error: ${errText}`);
                        upsertToolMessage(toolItemId, call, "failed", errText, errText);
                    }
                }
                if (rounds >= MAX_TOOL_ROUNDS) {
                    builtinSession.transcript.push({ role: "system", content: t("agent.builtin.toolLimitReached", { count: MAX_TOOL_ROUNDS }) });
                    const finalId = randomId();
                    const finalResult = await callModel((delta) => pushAssistantDelta(finalId, delta));
                    if (finalResult.content) {
                        const visible = stripReActBlocks(finalResult.content) || finalResult.content;
                        pushAssistantDelta(finalId, visible);
                        builtinSession.transcript.push({ role: "assistant", content: visible });
                    }
                    break;
                }
            }
            clearStreamFlags();
            setAgentState({ sending: false, waiting: false, activity: textModel ? modelOptionName(textModel) : "" });
            persistBuiltinSession(() => useAgentStore.getState().messages);
        } catch (error) {
            clearStreamFlags();
            if (controller.signal.aborted) {
                setAgentState({ sending: false, waiting: false, activity: textModel ? modelOptionName(textModel) : "" });
                persistBuiltinSession(() => useAgentStore.getState().messages);
                return;
            }
            const errText = error instanceof Error ? error.message : t("agent.state.requestFailed");
            setAgentState({
                sending: false,
                waiting: false,
                connectError: errText,
                activity: t("agent.status.failed"),
                messages: [...useAgentStore.getState().messages, { id: randomId(), role: "error" as const, text: errText }],
            });
            message.error(errText);
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setStreamId("");
        }
    };

    useEffect(() => () => abortRef.current?.abort(), []);

    const statusText = channelLabel || t("agent.status.disconnected");
    const statusColor = ready ? "#16a34a" : "#d97706";

    return (
        <>
            <AgentPanelTabs
                value={activeTab === "skills" || activeTab === "log" ? "chat" : activeTab}
                theme={theme}
                leading={
                    <div className="flex items-center gap-1">
                        <span className="grid size-8 place-items-center">
                            <Bot className="size-4" />
                        </span>
                        <div className="hidden text-base font-semibold leading-5 @min-[560px]:block">Agent</div>
                        <Tooltip title={t("agent.panel.connectionSettings", { status: statusText })} placement="bottom">
                            <Button
                                size="small"
                                type="text"
                                className="!h-8 !w-8 !min-w-8 !px-0 @min-[560px]:!w-auto @min-[560px]:!min-w-0 @min-[560px]:!px-[7px]"
                                aria-label={t("agent.panel.connectionSettingsLabel", { status: statusText })}
                                icon={<PlugZap className="size-3.5" style={{ color: statusColor }} />}
                                onClick={() => setAgentState({ activeTab: "setup" })}
                            >
                                <span className="hidden max-w-[120px] truncate @min-[560px]:inline">{statusText}</span>
                            </Button>
                        </Tooltip>
                    </div>
                }
                items={[
                    { value: "chat", label: t("agent.panel.chat"), icon: <MessageSquare className="size-3.5" /> },
                    { value: "history", label: t("agent.panel.history"), icon: <History className="size-3.5" /> },
                    { value: "setup", label: t("agent.connect.settingsTab"), icon: <Settings2 className="size-3.5" /> },
                ]}
                onChange={(next) => setAgentState({ activeTab: next as "chat" | "setup" | "history" })}
                right={
                    <>
                        <Tooltip title={t("agent.history.newThread")} placement="bottom">
                            <Button
                                size="small"
                                type="text"
                                className="!h-8 !w-8 !min-w-8 !px-0 @min-[560px]:!w-auto @min-[560px]:!min-w-0 @min-[560px]:!px-[7px]"
                                aria-label={t("agent.history.newThread")}
                                disabled={sending || waiting}
                                icon={<Plus className="size-3.5" />}
                                onClick={startNewThread}
                            >
                                <span className="hidden @min-[560px]:inline">{t("agent.history.newThread")}</span>
                            </Button>
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

            {activeTab === "setup" ? (
                <>
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
                    <AgentMcpSettings theme={theme} />
                </>
            ) : activeTab === "history" ? (
                <BuiltinAgentHistoryView
                    theme={theme}
                    threads={threads}
                    activeThreadId={activeThreadId}
                    busy={sending || waiting}
                    onRefresh={refreshThreads}
                    onNewThread={startNewThread}
                    onOpenThread={openThread}
                    onDeleteThreads={deleteThreads}
                />
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
                    />
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
                        hint={t("agent.composer.tokenHint")}
                        models={composerModels}
                        model={textModel || composerModels[0]?.model}
                        onModelChange={changeModel}
                        onPromptChange={(next) => setAgentState({ prompt: next })}
                        onSubmit={() => void sendPrompt()}
                        onStop={stopTurn}
                        left={
                            <>
                                {skills.length ? (
                                    <Dropdown
                                        trigger={["click"]}
                                        menu={{
                                            items: [
                                                { key: "", label: t("agent.builtin.noSkill") },
                                                ...skills.map((skill) => ({
                                                    key: skill.name,
                                                    label: `${skill.name}${skill.description ? ` · ${skill.description}` : ""}`,
                                                })),
                                            ],
                                            selectable: true,
                                            selectedKeys: selectedSkillName ? [selectedSkillName] : [],
                                            onClick: ({ key }) => selectSkill(String(key)),
                                        }}
                                    >
                                        <Tooltip title={t("agent.builtin.skillPicker")} placement="top">
                                            <Button
                                                size="small"
                                                type="text"
                                                className="!h-9 !px-2"
                                                style={{ color: selectedSkillName ? theme.node.text : theme.node.muted }}
                                                icon={<Sparkles className="size-4" />}
                                            >
                                                {selectedSkillName ? <span className="max-w-[120px] truncate text-[11px]">{selectedSkillName}</span> : null}
                                            </Button>
                                        </Tooltip>
                                    </Dropdown>
                                ) : null}
                                {streamId ? (
                                    <span className="hidden text-[11px] @min-[660px]:inline" style={{ color: theme.node.muted }}>
                                        <TerminalSquare className="mr-1 inline size-3" />
                                        {t("agent.panel.builtinStreaming")}
                                    </span>
                                ) : null}
                            </>
                        }
                    />
                </>
            )}
        </>
    );
}
