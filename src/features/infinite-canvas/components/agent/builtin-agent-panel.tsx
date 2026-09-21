import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Tooltip } from "antd";
import { Bot, MessageSquare, PanelRightClose, PlugZap, Plus, Settings2, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentChatTimeline } from "./agent-chat";
import { AgentChatComposer } from "./agent-chat-composer";
import { AgentConnectView } from "./agent-connect-view";
import { AgentPanelTabs } from "./agent-panel-tabs";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { randomId } from "@canvas/lib/utils";
import { requestImageQuestion, type AiTextMessage } from "@canvas/services/api/image";
import { useAgentStore, type AgentChatItem, type AgentModel } from "@canvas/stores/use-agent-store";
import {
    modelOptionName,
    resolveModelChannel,
    selectableModelsByCapability,
    useConfigStore,
    useEffectiveConfig,
} from "@canvas/stores/use-config-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

/**
 * Built-in side-panel chat: uses the user's channel Base URL + API Key.
 * Does not depend on external Canvas Agent / SSE.
 */
export function BuiltinAgentPanel() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const {
        prompt,
        messages,
        sending,
        waiting,
        activeTab,
        activity,
        connectError,
    } = useAgentStore();
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const closePanel = useAgentStore((state) => state.closePanel);
    const abortRef = useRef<AbortController | null>(null);
    const [streamId, setStreamId] = useState("");

    const textModels = useMemo(() => selectableModelsByCapability(config, "text"), [config]);
    const textModel = useMemo(() => {
        if (config.textModel && textModels.includes(config.textModel)) return config.textModel;
        if (config.model && textModels.includes(config.model)) return config.model;
        return textModels[0] || "";
    }, [config.model, config.textModel, textModels]);
    const ready = Boolean(textModel) && isAiConfigReady(config, textModel);
    const channel = textModel ? resolveModelChannel(config, textModel) : null;

    const composerModels = useMemo<AgentModel[]>(
        () =>
            textModels.map((value) => {
                const ch = resolveModelChannel(config, value);
                const name = modelOptionName(value);
                return {
                    id: value,
                    model: value,
                    displayName: ch.name ? `${name} · ${ch.name}` : name,
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
            connectError: ready ? "" : t("agent.connect.configureAiFirst"),
        });
    }, [ready, setAgentState, t, textModel]);

    const channelLabel = useMemo(() => {
        if (!ready) return t("agent.connect.aiNotReady");
        return modelOptionName(textModel) || t("agent.connect.aiReady");
    }, [ready, t, textModel]);

    const stopTurn = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setAgentState({ sending: false, waiting: false });
        setStreamId("");
    };

    const startNewThread = () => {
        stopTurn();
        setAgentState({ messages: [], prompt: "", connectError: "" });
    };

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

        const userMessage: AgentChatItem = {
            id: randomId(),
            role: "user",
            text,
        };
        const assistantId = randomId();
        const nextStreamId = randomId();
        const history: AiTextMessage[] = [...messages]
            .filter((item) => item.role === "user" || item.role === "assistant")
            .map((item) => ({ role: item.role as "user" | "assistant", content: item.text }));
        history.push({ role: "user", content: text });

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setStreamId(nextStreamId);
        setAgentState({
            prompt: "",
            sending: true,
            waiting: true,
            messages: [
                ...messages,
                userMessage,
                { id: assistantId, role: "assistant", text: "", streamId: nextStreamId },
            ],
            connectError: "",
            activity: t("agent.panel.builtinStreaming"),
        });

        try {
            const answer = await requestImageQuestion(
                { ...config, model: textModel, textModel },
                history,
                (delta) => {
                    const latest = useAgentStore.getState().messages;
                    setAgentState({
                        messages: latest.map((item) =>
                            item.id === assistantId
                                ? { ...item, text: delta, streamId: nextStreamId }
                                : item,
                        ),
                    });
                },
                { signal: controller.signal },
            );
            const latest = useAgentStore.getState().messages;
            setAgentState({
                messages: latest.map((item) =>
                    item.id === assistantId ? { ...item, text: answer || item.text, streamId: undefined } : item,
                ),
                sending: false,
                waiting: false,
                activity: textModel ? modelOptionName(textModel) : "",
            });
        } catch (error) {
            if (controller.signal.aborted) {
                setAgentState({ sending: false, waiting: false, activity: textModel ? modelOptionName(textModel) : "" });
                return;
            }
            const errText = error instanceof Error ? error.message : t("agent.state.requestFailed");
            const latest = useAgentStore.getState().messages;
            setAgentState({
                messages: latest.map((item) =>
                    item.id === assistantId
                        ? { ...item, text: item.text || errText, streamId: undefined }
                        : item,
                ),
                sending: false,
                waiting: false,
                connectError: errText,
                activity: t("agent.status.failed"),
            });
            message.error(errText);
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            setStreamId("");
        }
    };

    useEffect(() => () => abortRef.current?.abort(), []);

    const statusText = ready
        ? channelLabel
        : connectError || t("agent.status.disconnected");
    const statusColor = ready ? "#16a34a" : "#d97706";

    return (
        <>
            <AgentPanelTabs
                value={activeTab === "history" || activeTab === "skills" || activeTab === "log" ? "chat" : activeTab}
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
                    { value: "setup", label: t("agent.connect.settingsTab"), icon: <Settings2 className="size-3.5" /> },
                ]}
                onChange={(next) => setAgentState({ activeTab: next === "setup" ? "setup" : "chat" })}
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
                <AgentConnectView
                    theme={theme}
                    connected={ready}
                    activity={activity}
                    connectError={ready ? "" : t("agent.connect.configureAiFirst")}
                    onToggleEnabled={() => openConfigDialog(false, "channels")}
                    builtin
                    baseUrl={channel?.baseUrl || ""}
                    channelName={channel?.name || ""}
                    modelLabel={textModel ? modelOptionName(textModel) : ""}
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
                                : t("agent.connect.configureAiFirst")
                        }
                        theme={theme}
                        models={composerModels}
                        model={textModel || composerModels[0]?.model}
                        onModelChange={changeModel}
                        onPromptChange={(next) => setAgentState({ prompt: next })}
                        onSubmit={() => void sendPrompt()}
                        onStop={stopTurn}
                        left={
                            streamId ? (
                                <span className="hidden text-[11px] @min-[660px]:inline" style={{ color: theme.node.muted }}>
                                    <TerminalSquare className="mr-1 inline size-3" />
                                    {t("agent.panel.builtinStreaming")}
                                </span>
                            ) : null
                        }
                    />
                </>
            )}
        </>
    );
}
