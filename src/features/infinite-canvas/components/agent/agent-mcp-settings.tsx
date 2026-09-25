import { useState } from "react";
import { App, Button, Input, Popconfirm, Switch, Tooltip } from "antd";
import { CirclePlus, LoaderCircle, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import type { McpServerConfig } from "@canvas/lib/mcp/mcp-client";
import { isTauri } from "@canvas/services/fs-store";
import { useMcpClientStore } from "@canvas/stores/use-mcp-client-store";

const statusColor: Record<string, string> = {
    ready: "#16a34a",
    connecting: "#d97706",
    error: "#dc2626",
    idle: "#94a3b8",
};

/** MCP server management for the built-in agent setup tab. */
export function AgentMcpSettings({ theme }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const servers = useMcpClientStore((state) => state.servers);
    const runtime = useMcpClientStore((state) => state.runtime);
    const addServer = useMcpClientStore((state) => state.addServer);
    const updateServer = useMcpClientStore((state) => state.updateServer);
    const removeServer = useMcpClientStore((state) => state.removeServer);
    const connect = useMcpClientStore((state) => state.connect);
    const disconnect = useMcpClientStore((state) => state.disconnect);
    const connectAll = useMcpClientStore((state) => state.connectAll);

    const [name, setName] = useState("");
    const [type, setType] = useState<"http" | "stdio">("http");
    const [url, setUrl] = useState("");
    const [command, setCommand] = useState("");

    const add = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning(t("agent.mcpClient.nameRequired"));
            return;
        }
        if (type === "http" && !url.trim()) {
            message.warning(t("agent.mcpClient.urlRequired"));
            return;
        }
        if (type === "stdio" && !command.trim()) {
            message.warning(t("agent.mcpClient.commandRequired"));
            return;
        }
        const server = addServer({
            name: trimmed,
            type,
            url: type === "http" ? url.trim() : undefined,
            command: type === "stdio" ? command.trim() : undefined,
            args: type === "stdio" ? [] : undefined,
            enabled: true,
        });
        setName("");
        setUrl("");
        setCommand("");
        void connect(server.id);
    };

    const statusText = (server: McpServerConfig) => {
        const state = runtime[server.id];
        if (!state || state.status === "idle") return t("agent.mcpClient.idle");
        if (state.status === "connecting") return t("agent.mcpClient.connecting");
        if (state.status === "error") return state.error || t("agent.mcpClient.error");
        return t("agent.mcpClient.toolCount", { count: state.tools.length });
    };

    return (
        <div className="border-t px-4 py-3" style={{ borderColor: theme.node.stroke }}>
            <div className="mb-2 flex items-center justify-between">
                <div className="text-[12px] font-medium" style={{ color: theme.node.text }}>
                    <PlugZap className="mr-1 inline size-3.5" />
                    {t("agent.mcpClient.title")}
                </div>
                {servers.length ? (
                    <Tooltip title={t("agent.mcpClient.connectAll")}>
                        <Button size="small" type="text" className="!h-7 !px-1.5 text-[11px]" icon={<RefreshCw className="size-3" />} onClick={() => void connectAll()}>
                            {t("agent.mcpClient.connectAll")}
                        </Button>
                    </Tooltip>
                ) : null}
            </div>

            {servers.length ? (
                <div className="mb-3 space-y-1.5">
                    {servers.map((server) => {
                        const state = runtime[server.id];
                        const busy = state?.status === "connecting";
                        return (
                            <div key={server.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: theme.node.stroke }}>
                                <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor[state?.status || "idle"] }} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[12px]" style={{ color: theme.node.text }}>{server.name}</div>
                                    <div className="truncate text-[10px]" style={{ color: theme.node.muted }}>
                                        {server.type === "stdio" ? server.command : server.url} · {statusText(server)}
                                    </div>
                                </div>
                                {busy ? <LoaderCircle className="size-3.5 animate-spin" style={{ color: theme.node.muted }} /> : null}
                                <Switch
                                    size="small"
                                    checked={server.enabled}
                                    onChange={(checked) => {
                                        updateServer(server.id, { enabled: checked });
                                        if (checked) void connect(server.id);
                                        else void disconnect(server.id);
                                    }}
                                />
                                <Popconfirm title={t("agent.mcpClient.removeTitle")} okText={t("common.confirm")} cancelText={t("common.cancel")} onConfirm={() => removeServer(server.id)}>
                                    <Button size="small" type="text" danger className="!h-7 !w-7 !min-w-7 !px-0" icon={<Trash2 className="size-3.5" />} aria-label={t("agent.mcpClient.remove")} />
                                </Popconfirm>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            <div className="space-y-1.5">
                <div className="flex gap-1.5">
                    <Input size="small" placeholder={t("agent.mcpClient.namePlaceholder")} value={name} onChange={(event) => setName(event.target.value)} className="!w-32" />
                    <Button size="small" type={type === "http" ? "primary" : "default"} onClick={() => setType("http")}>HTTP</Button>
                    <Button size="small" type={type === "stdio" ? "primary" : "default"} onClick={() => setType("stdio")} disabled={!isTauri()}>
                        stdio
                    </Button>
                </div>
                {type === "http" ? (
                    <Input size="small" placeholder={t("agent.mcpClient.urlPlaceholder")} value={url} onChange={(event) => setUrl(event.target.value)} onPressEnter={add} />
                ) : (
                    <Input size="small" placeholder={t("agent.mcpClient.commandPlaceholder")} value={command} onChange={(event) => setCommand(event.target.value)} onPressEnter={add} />
                )}
                <Button size="small" type="primary" icon={<CirclePlus className="size-3.5" />} onClick={add} block>
                    {t("agent.mcpClient.add")}
                </Button>
            </div>
        </div>
    );
}
