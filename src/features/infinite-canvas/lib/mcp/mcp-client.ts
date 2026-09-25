import i18n from "@canvas/i18n";
import { isTauri } from "@canvas/services/fs-store";

export type McpServerType = "http" | "stdio";

export type McpServerConfig = {
    id: string;
    name: string;
    type: McpServerType;
    /** http: endpoint URL (streamable HTTP or SSE). */
    url?: string;
    /** stdio: executable, e.g. "npx". */
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    enabled: boolean;
};

export type McpToolInfo = {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
};

export type McpServerStatus = "idle" | "connecting" | "ready" | "error";

export type McpServerRuntime = {
    status: McpServerStatus;
    error?: string;
    tools: McpToolInfo[];
};

type JsonRpcMessage = { jsonrpc?: string; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string } };

const CLIENT_INFO = { name: "minimalist-canvas", version: "0.1.0" };
const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT = 30_000;

export interface McpClient {
    listTools(): Promise<McpToolInfo[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    close(): Promise<void>;
}

export function mcpToolFullName(serverName: string, toolName: string) {
    const safe = (value: string) => value.replace(/[^a-zA-Z0-9_]/g, "_");
    return `mcp__${safe(serverName)}__${safe(toolName)}`;
}

export function parseMcpToolName(full: string): { server: string; tool: string } | null {
    const match = /^mcp__([a-zA-Z0-9_]+)__(.+)$/.exec(full);
    return match ? { server: match[1], tool: match[2] } : null;
}

export function isMcpToolName(name: string) {
    return name.startsWith("mcp__");
}

export async function connectMcpServer(config: McpServerConfig): Promise<McpClient> {
    if (config.type === "stdio") {
        if (!isTauri()) throw new Error(i18n.t("agent.mcpClient.stdioDesktopOnly"));
        return connectStdioServer(config);
    }
    return connectHttpServer(config);
}

/* ------------------------------ streamable HTTP ------------------------------ */

async function connectHttpServer(config: McpServerConfig): Promise<McpClient> {
    const url = (config.url || "").trim();
    if (!url) throw new Error(i18n.t("agent.mcpClient.urlRequired"));
    let sessionId = "";
    let nextId = 1;

    const post = async (message: JsonRpcMessage | JsonRpcMessage[]): Promise<JsonRpcMessage[]> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json, text/event-stream",
                    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
                },
                body: JSON.stringify(message),
                signal: controller.signal,
            });
            const sid = response.headers.get("mcp-session-id");
            if (sid) sessionId = sid;
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const type = response.headers.get("content-type") || "";
            if (type.includes("text/event-stream")) return await readSseMessages(response);
            const text = await response.text();
            if (!text.trim()) return [];
            const parsed = JSON.parse(text) as JsonRpcMessage | JsonRpcMessage[];
            return Array.isArray(parsed) ? parsed : [parsed];
        } finally {
            clearTimeout(timer);
        }
    };

    const request = async (method: string, params?: unknown): Promise<JsonRpcMessage> => {
        const id = nextId++;
        const responses = await post({ jsonrpc: "2.0", id, method, params });
        const reply = responses.find((item) => item.id === id);
        if (!reply) throw new Error(i18n.t("agent.mcpClient.noResponse"));
        if (reply.error) throw new Error(reply.error.message || `RPC ${reply.error.code ?? "error"}`);
        return reply;
    };

    const notify = (method: string, params?: unknown) => post({ jsonrpc: "2.0", method, params }).catch(() => undefined);

    await request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
    });
    await notify("notifications/initialized");

    return {
        async listTools() {
            const reply = await request("tools/list");
            const tools = (isRecord(reply.result) && Array.isArray(reply.result.tools) ? reply.result.tools : []) as Array<Record<string, unknown>>;
            return tools.map((tool) => ({
                name: String(tool.name || ""),
                description: typeof tool.description === "string" ? tool.description : undefined,
                inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
            })).filter((tool) => tool.name);
        },
        async callTool(name, args) {
            const reply = await request("tools/call", { name, arguments: args });
            const result = isRecord(reply.result) ? reply.result : {};
            const content = Array.isArray(result.content) ? result.content : [];
            const text = content
                .map((item) => (isRecord(item) && item.type === "text" ? String(item.text ?? "") : ""))
                .filter(Boolean)
                .join("\n");
            if (result.isError) throw new Error(text || i18n.t("agent.mcpClient.toolFailed", { name }));
            try {
                return JSON.parse(text);
            } catch {
                return text || result;
            }
        },
        async close() {
            // Best-effort session termination per streamable HTTP spec.
            if (!sessionId) return;
            try {
                await fetch(url, { method: "DELETE", headers: { "mcp-session-id": sessionId } });
            } catch {
                // ignore
            }
        },
    };
}

async function readSseMessages(response: Response): Promise<JsonRpcMessage[]> {
    const messages: JsonRpcMessage[] = [];
    const body = response.body;
    if (!body) return messages;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const flush = (block: string) => {
        const data = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).replace(/^ /, ""))
            .join("\n")
            .trim();
        if (!data) return;
        try {
            const parsed = JSON.parse(data) as JsonRpcMessage;
            if (parsed) messages.push(parsed);
        } catch {
            // ignore malformed events
        }
    };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let match;
        while ((match = buffer.match(/\r?\n\r?\n/))) {
            flush(buffer.slice(0, match.index));
            buffer = buffer.slice((match.index ?? 0) + match[0].length);
        }
    }
    if (buffer.trim()) flush(buffer);
    return messages;
}

/* ----------------------------------- stdio ----------------------------------- */

type StdioChild = { write(data: string): Promise<void>; kill(): Promise<void> };
type StdioEvent = { on(event: "data", cb: (line: string) => void): void };

async function connectStdioServer(config: McpServerConfig): Promise<McpClient> {
    const command = (config.command || "").trim();
    if (!command) throw new Error(i18n.t("agent.mcpClient.commandRequired"));
    const { Command } = await import("@tauri-apps/plugin-shell");
    const isWindows = navigator.userAgent.includes("Windows");
    // npx/npm/cmd shims on Windows must run through cmd.exe.
    const program = isWindows && !/\.(exe|bat|cmd)$/i.test(command) ? "cmd" : command;
    const args = isWindows && !/\.(exe|bat|cmd)$/i.test(command) ? ["/c", command, ...(config.args || [])] : config.args || [];
    const proc = Command.create(program, args, { env: config.env || {} }) as unknown as {
        stdout: StdioEvent;
        stderr: StdioEvent;
        spawn(): Promise<StdioChild>;
    };
    const pending = new Map<number, { resolve: (msg: JsonRpcMessage) => void; reject: (err: Error) => void }>();
    let stdoutBuffer = "";
    proc.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk;
        let index;
        while ((index = stdoutBuffer.indexOf("\n")) >= 0) {
            const line = stdoutBuffer.slice(0, index).trim();
            stdoutBuffer = stdoutBuffer.slice(index + 1);
            if (!line) continue;
            try {
                const message = JSON.parse(line) as JsonRpcMessage;
                const id = typeof message.id === "number" ? message.id : -1;
                const entry = pending.get(id);
                if (entry) {
                    pending.delete(id);
                    entry.resolve(message);
                }
            } catch {
                // ignore non-JSON noise lines
            }
        }
    });
    let stderrText = "";
    proc.stderr.on("data", (chunk) => {
        stderrText = `${stderrText}${chunk}`.slice(-4000);
    });
    const child = await proc.spawn();
    let nextId = 1;

    const request = async (method: string, params?: unknown): Promise<JsonRpcMessage> => {
        const id = nextId++;
        return new Promise<JsonRpcMessage>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(i18n.t("agent.mcpClient.timeout", { method })));
            }, REQUEST_TIMEOUT);
            pending.set(id, {
                resolve: (message) => {
                    clearTimeout(timer);
                    if (message.error) reject(new Error(message.error.message || `RPC ${message.error.code ?? "error"}`));
                    else resolve(message);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                },
            });
            child.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n").catch((error) => {
                pending.delete(id);
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            });
        });
    };

    try {
        await request("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO });
    } catch (error) {
        await child.kill().catch(() => undefined);
        const detail = stderrText.trim();
        throw new Error(detail || (error instanceof Error ? error.message : String(error)));
    }
    await child.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n").catch(() => undefined);

    return {
        async listTools() {
            const reply = await request("tools/list");
            const tools = (isRecord(reply.result) && Array.isArray(reply.result.tools) ? reply.result.tools : []) as Array<Record<string, unknown>>;
            return tools.map((tool) => ({
                name: String(tool.name || ""),
                description: typeof tool.description === "string" ? tool.description : undefined,
                inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} },
            })).filter((tool) => tool.name);
        },
        async callTool(name, args) {
            const reply = await request("tools/call", { name, arguments: args });
            const result = isRecord(reply.result) ? reply.result : {};
            const content = Array.isArray(result.content) ? result.content : [];
            const text = content
                .map((item) => (isRecord(item) && item.type === "text" ? String(item.text ?? "") : ""))
                .filter(Boolean)
                .join("\n");
            if (result.isError) throw new Error(text || i18n.t("agent.mcpClient.toolFailed", { name }));
            try {
                return JSON.parse(text);
            } catch {
                return text || result;
            }
        },
        async close() {
            await child.kill().catch(() => undefined);
        },
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
