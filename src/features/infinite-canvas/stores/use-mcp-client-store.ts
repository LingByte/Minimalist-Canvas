import { create } from "zustand";

import i18n from "@canvas/i18n";
import { connectMcpServer, isMcpToolName, mcpToolFullName, parseMcpToolName, type McpClient, type McpServerConfig, type McpServerRuntime, type McpToolInfo } from "@canvas/lib/mcp/mcp-client";
import type { ResponseFunctionTool } from "@canvas/services/api/image";
import { randomId } from "@canvas/lib/utils";

const STORAGE_KEY = "canvas-mcp-servers";

type McpClientStore = {
    servers: McpServerConfig[];
    runtime: Record<string, McpServerRuntime>;
    hydrated: boolean;
    hydrate: () => void;
    addServer: (input: Omit<McpServerConfig, "id">) => McpServerConfig;
    updateServer: (id: string, patch: Partial<McpServerConfig>) => void;
    removeServer: (id: string) => void;
    connect: (id: string) => Promise<void>;
    disconnect: (id: string) => Promise<void>;
    connectAll: () => Promise<void>;
};

/** Live client handles — module scope, not serializable state. */
const clients = new Map<string, McpClient>();
const connecting = new Map<string, Promise<void>>();

function loadServers(): McpServerConfig[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((item): item is McpServerConfig => Boolean(item?.id && item?.name)) : [];
    } catch {
        return [];
    }
}

function saveServers(servers: McpServerConfig[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    } catch {
        // storage full / unavailable
    }
}

export const useMcpClientStore = create<McpClientStore>((set, get) => ({
    servers: typeof window === "undefined" ? [] : loadServers(),
    runtime: {},
    hydrated: true,
    hydrate: () => set({ servers: loadServers(), hydrated: true }),
    addServer: (input) => {
        const server: McpServerConfig = { ...input, id: randomId() };
        const servers = [...get().servers, server];
        saveServers(servers);
        set({ servers });
        return server;
    },
    updateServer: (id, patch) => {
        const servers = get().servers.map((server) => (server.id === id ? { ...server, ...patch } : server));
        saveServers(servers);
        set({ servers });
    },
    removeServer: (id) => {
        void get().disconnect(id);
        const servers = get().servers.filter((server) => server.id !== id);
        saveServers(servers);
        set((state) => ({ servers, runtime: Object.fromEntries(Object.entries(state.runtime).filter(([key]) => key !== id)) }));
    },
    connect: async (id) => {
        const server = get().servers.find((item) => item.id === id);
        if (!server || connecting.has(id)) return connecting.get(id);
        const task = (async () => {
            set((state) => ({ runtime: { ...state.runtime, [id]: { status: "connecting", tools: [] } } }));
            try {
                const client = await connectMcpServer(server);
                const tools = await client.listTools();
                clients.set(id, client);
                set((state) => ({ runtime: { ...state.runtime, [id]: { status: "ready", tools } } }));
            } catch (error) {
                set((state) => ({
                    runtime: { ...state.runtime, [id]: { status: "error", error: error instanceof Error ? error.message : String(error), tools: [] } },
                }));
            } finally {
                connecting.delete(id);
            }
        })();
        connecting.set(id, task);
        return task;
    },
    disconnect: async (id) => {
        await clients.get(id)?.close().catch(() => undefined);
        clients.delete(id);
        set((state) => ({ runtime: { ...state.runtime, [id]: { status: "idle", tools: [] } } }));
    },
    connectAll: async () => {
        await Promise.allSettled(
            get()
                .servers.filter((server) => server.enabled)
                .map((server) => get().connect(server.id)),
        );
    },
}));

/** All currently-connected MCP tools as OpenAI function definitions. */
export function mcpAgentTools(): ResponseFunctionTool[] {
    const { servers, runtime } = useMcpClientStore.getState();
    return servers.flatMap((server) => {
        const tools = runtime[server.id]?.status === "ready" ? runtime[server.id].tools : [];
        return tools.map((tool: McpToolInfo): ResponseFunctionTool => ({
            type: "function",
            function: {
                name: mcpToolFullName(server.name || server.id, tool.name),
                description: `[MCP ${server.name}] ${tool.description || tool.name}`,
                parameters: tool.inputSchema || { type: "object", properties: {} },
            },
        }));
    });
}

/** Route an mcp__server__tool call to the owning server. */
export async function callMcpTool(fullName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!isMcpToolName(fullName)) throw new Error(i18n.t("agent.mcpClient.unknownTool", { name: fullName }));
    const parsed = parseMcpToolName(fullName);
    if (!parsed) throw new Error(i18n.t("agent.mcpClient.unknownTool", { name: fullName }));
    const { servers } = useMcpClientStore.getState();
    const server = servers.find((item) => (item.name || item.id).replace(/[^a-zA-Z0-9_]/g, "_") === parsed.server);
    const client = server ? clients.get(server.id) : undefined;
    if (!server || !client) throw new Error(i18n.t("agent.mcpClient.notConnected", { server: parsed.server }));
    return client.callTool(parsed.tool, args);
}
