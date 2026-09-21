import { useEffect, useState } from "react";
import { App, Button, Tooltip } from "antd";
import copyToClipboard from "copy-to-clipboard";
import { Copy, Settings2, SquareTerminal, TerminalSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { isTauri } from "@canvas/services/fs-store";
import { useAgentStore } from "@canvas/stores/use-agent-store";
import { useConfigStore } from "@canvas/stores/use-config-store";

const AGENT_MCP_REMOVE_COMMAND = "codex mcp remove infinite-canvas";

function useMcpEndpoint() {
    const [endpoint, setEndpoint] = useState("http://127.0.0.1:17371/mcp");
    useEffect(() => {
        if (!isTauri()) return;
        let disposed = false;
        void import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke<string>("mcp_endpoint")
                .then((value) => {
                    if (!disposed && value) setEndpoint(value);
                })
                .catch(() => undefined),
        );
        return () => {
            disposed = true;
        };
    }, []);
    return endpoint;
}

function useMcpRegistered() {
    const [registered, setRegistered] = useState(false);
    const refresh = async () => {
        if (!isTauri()) return false;
        const { invoke } = await import("@tauri-apps/api/core");
        const value = await invoke<boolean>("mcp_registered").catch(() => false);
        setRegistered(value);
        return value;
    };
    useEffect(() => {
        if (!isTauri()) return;
        let disposed = false;
        const check = async () => {
            const { invoke } = await import("@tauri-apps/api/core");
            const value = await invoke<boolean>("mcp_registered").catch(() => false);
            if (!disposed) setRegistered(value);
        };
        void check();
        const timer = window.setInterval(check, 15000);
        return () => {
            disposed = true;
            window.clearInterval(timer);
        };
    }, []);
    return { mcpRegistered: registered, refreshMcpRegistered: refresh };
}

export function AgentConnectView({
    theme,
    connected,
    connectError,
    onToggleEnabled,
    builtin = false,
    baseUrl = "",
    channelName = "",
    modelLabel = "",
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url?: string;
    token?: string;
    enabled?: boolean;
    connected: boolean;
    activity?: string;
    connectError: string;
    onUrlChange?: (value: string) => void;
    onTokenChange?: (value: string) => void;
    onToggleEnabled: () => void;
    /** Built-in Base URL + API Key chat (no external Canvas Agent). */
    builtin?: boolean;
    baseUrl?: string;
    channelName?: string;
    modelLabel?: string;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const mcpEndpoint = useMcpEndpoint();
    const { mcpRegistered, refreshMcpRegistered } = useMcpRegistered();
    const workspacePath = useAgentStore((state) => state.workspacePath);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [registering, setRegistering] = useState(false);
    const [openingTerminal, setOpeningTerminal] = useState(false);
    const mcpAddCommand = `codex mcp add infinite-canvas --url ${mcpEndpoint}`;
    const statusText = connectError
        ? t("agent.status.failed")
        : connected
          ? modelLabel || channelName || t("agent.connect.aiReady")
          : t("agent.connect.configureAiFirst");
    const statusColor = connectError ? "#dc2626" : connected ? "#16a34a" : theme.node.muted;

    const registerMcp = async () => {
        setRegistering(true);
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke<string>("register_codex_mcp");
            await refreshMcpRegistered();
            window.dispatchEvent(new Event("canvas:mcp-registered"));
            message.success(t("agent.connect.mcpRegistered"));
        } catch (error) {
            const raw = String(error instanceof Error ? error.message : error);
            const missing =
                raw.includes("CODEX_NOT_INSTALLED") ||
                /os error 2|enoent|no such file or directory|codex not found/i.test(raw);
            message.error(missing ? t("agent.connect.codexNotInstalled") : raw);
        } finally {
            setRegistering(false);
        }
    };

    const openTerminal = async () => {
        setOpeningTerminal(true);
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("open_codex_terminal", { cwd: workspacePath || null });
            message.success(t("agent.connect.terminalOpened"));
        } catch (error) {
            const raw = String(error instanceof Error ? error.message : error);
            const missing =
                raw.includes("CODEX_NOT_INSTALLED") ||
                /os error 2|enoent|no such file or directory|codex not found/i.test(raw);
            message.error(missing ? t("agent.connect.codexNotInstalled") : raw);
        } finally {
            setOpeningTerminal(false);
        }
    };

    const copyCommand = (command: string) => {
        copyToClipboard(command);
        message.success(t("agent.connect.commandCopied"));
    };

    if (builtin) {
        return (
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                    <div>
                        <div className="text-base font-semibold leading-6">{t("agent.connect.title")}</div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {t("agent.connect.builtinDescription")}
                        </div>
                    </div>

                    <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 text-sm font-medium leading-5">{t("agent.connect.inAppTitle")}</span>
                                    <span
                                        className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                                        style={{ borderColor: statusColor, color: statusColor }}
                                    >
                                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                                        <span className="truncate">{statusText}</span>
                                    </span>
                                </div>
                                <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                    {connected
                                        ? t("agent.connect.aiReadyDetail", { model: modelLabel || "-" })
                                        : t("agent.connect.configureAiFirst")}
                                </div>
                            </div>
                            <Button className="!h-8 !px-3" type="primary" icon={<Settings2 className="size-4" />} onClick={() => { onToggleEnabled(); openConfigDialog(false, "channels"); }}>
                                {t("agent.connect.openAiConfig")}
                            </Button>
                        </div>
                        <div className="mt-3 grid gap-2 text-xs" style={{ color: theme.node.muted }}>
                            <div className="flex gap-2">
                                <span className="w-16 shrink-0">{t("agent.connect.channelLabel")}</span>
                                <span className="min-w-0 break-all" style={{ color: theme.node.text }}>{channelName || t("agent.connect.channelEmpty")}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="w-16 shrink-0">{t("agent.connect.baseUrlLabel")}</span>
                                <code className="min-w-0 flex-1 break-all rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                    {baseUrl || t("agent.connect.baseUrlEmpty")}
                                </code>
                            </div>
                            <div className="flex gap-2">
                                <span className="w-16 shrink-0">{t("agent.connect.modelLabel")}</span>
                                <span className="min-w-0 break-all" style={{ color: theme.node.text }}>{modelLabel || t("agent.connect.modelEmpty")}</span>
                            </div>
                        </div>
                        <p className="mt-2 text-[11px] leading-5" style={{ color: theme.node.muted }}>
                            {t("agent.connect.baseUrlHint")}
                        </p>
                    </div>

                    {isTauri() ? (
                        <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                            <div className="text-sm font-medium leading-5">{t("agent.connect.directTitle")}</div>
                            <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                {t("agent.connect.directText")}
                            </div>
                            <div className="mt-2 flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">{mcpAddCommand}</code>
                                <Tooltip title={t("agent.connect.copyCommand")}>
                                    <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(mcpAddCommand)} />
                                </Tooltip>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button size="small" className="!h-7" icon={<TerminalSquare className="size-3.5" />} loading={registering} onClick={() => void registerMcp()}>
                                    {t("agent.connect.registerMcp")}
                                </Button>
                                <Button size="small" className="!h-7" icon={<SquareTerminal className="size-3.5" />} loading={openingTerminal} onClick={() => void openTerminal()}>
                                    {t("agent.connect.openTerminal")}
                                </Button>
                            </div>
                            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                                <span className="text-xs" style={{ color: theme.node.muted }}>{t("agent.connect.mcpServer")}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "#16a34a", color: "#16a34a" }}>
                                    <span className="size-1.5 rounded-full" style={{ background: "#16a34a" }} />
                                    {t("agent.connect.mcpRunning")}
                                </span>
                                <span
                                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                                    style={{ borderColor: mcpRegistered ? "#0d9488" : theme.node.stroke, color: mcpRegistered ? "#0d9488" : theme.node.muted }}
                                >
                                    <span className="size-1.5 rounded-full" style={{ background: mcpRegistered ? "#0d9488" : theme.node.muted }} />
                                    {mcpRegistered ? t("agent.connect.mcpRegisteredBadge") : t("agent.connect.mcpNotRegistered")}
                                </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2 rounded-md border px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                                <code className="min-w-0 flex-1 overflow-x-auto text-[11px]">{mcpEndpoint}</code>
                                <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(mcpEndpoint)} />
                            </div>
                            <div className="mt-2 text-[11px] leading-5" style={{ color: theme.node.muted }}>
                                {t("agent.connect.mcpUsage")}
                            </div>
                            <Button size="small" type="text" className="!mt-1 !px-0" onClick={() => copyCommand(AGENT_MCP_REMOVE_COMMAND)}>
                                {t("agent.connect.removeMcp")}: {AGENT_MCP_REMOVE_COMMAND}
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    // Legacy Canvas Agent connect UI kept for non-builtin callers (if any).
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="text-sm" style={{ color: theme.node.muted }}>
                {t("agent.connect.builtinDescription")}
            </div>
            <Button className="!mt-3" type="primary" onClick={onToggleEnabled}>
                {t("agent.connect.openAiConfig")}
            </Button>
        </div>
    );
}
