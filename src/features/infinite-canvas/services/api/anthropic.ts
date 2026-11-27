import { buildApiUrl } from "@canvas/stores/use-config-store";

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 8192;

export type AnthropicChatContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export type AnthropicChatToolCall = {
    id: string;
    name: string;
    arguments: string;
};

export type AnthropicChatMessage =
    | { role: "system" | "user" | "assistant"; content: string | AnthropicChatContentPart[] }
    | { role: "assistant"; content: string | AnthropicChatContentPart[] | null; tool_calls: AnthropicChatToolCall[] }
    | { role: "tool"; tool_call_id: string; content: string };

export type AnthropicToolDefinition = {
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
};

export type AnthropicChatTurn = {
    content: string;
    toolCalls: AnthropicChatToolCall[];
};

type AnthropicContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
};

type StreamState = {
    buffer: string;
    text: string;
    toolCalls: Map<number, AnthropicChatToolCall>;
    error?: string;
};

export function anthropicHeaders(apiKey: string, extra?: Record<string, string>) {
    return {
        "x-api-key": apiKey,
        // Many OpenAI-compatible relays that speak Anthropic Messages still expect Bearer.
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
        ...(extra || {}),
    };
}

export function anthropicApiUrl(baseUrl: string, path: string) {
    return buildApiUrl(baseUrl || ANTHROPIC_BASE_URL, path);
}

export function toAnthropicTools(
    tools: Array<{ function: { name: string; description?: string; parameters: Record<string, unknown> } }>,
): AnthropicToolDefinition[] {
    return tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters || { type: "object", properties: {} },
    }));
}

export function toAnthropicBody(
    model: string,
    messages: AnthropicChatMessage[],
    tools?: AnthropicToolDefinition[],
    options?: { maxTokens?: number; systemPrompt?: string },
) {
    const { system, messages: converted } = toAnthropicMessages(messages, options?.systemPrompt);
    return {
        model,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(system ? { system } : {}),
        messages: converted,
        ...(tools?.length ? { tools } : {}),
        stream: true,
    };
}

export async function requestAnthropicMessages(
    config: { baseUrl: string; apiKey: string; model: string },
    messages: AnthropicChatMessage[],
    tools: AnthropicToolDefinition[],
    onDelta?: (text: string) => void,
    options?: { signal?: AbortSignal; systemPrompt?: string; maxTokens?: number },
): Promise<AnthropicChatTurn> {
    const response = await postAnthropicMessages(config, messages, tools, options);
    if (!response.ok) throw new Error(await readFetchError(response));
    if (!response.body) {
        const payload = (await response.json()) as Record<string, unknown>;
        return parseNonStreamPayload(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: StreamState = { buffer: "", text: "", toolCalls: new Map() };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    return {
        content: state.text,
        toolCalls: [...state.toolCalls.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, call]) => ({
                id: call.id || `call_${call.name || "tool"}`,
                name: call.name,
                arguments: call.arguments || "{}",
            }))
            .filter((call) => call.name),
    };
}

async function postAnthropicMessages(
    config: { baseUrl: string; apiKey: string; model: string },
    messages: AnthropicChatMessage[],
    tools: AnthropicToolDefinition[],
    options?: { signal?: AbortSignal; systemPrompt?: string; maxTokens?: number },
) {
    const url = anthropicApiUrl(config.baseUrl, "/messages");
    const headers = { ...anthropicHeaders(config.apiKey), Accept: "text/event-stream" };
    const body = JSON.stringify(toAnthropicBody(config.model, messages, tools, options));
    const { isTauri } = await import("@canvas/services/fs-store");
    // Desktop: plugin-http bypasses webview CORS (api.anthropic.com does not allow browser origins).
    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        return tauriFetch(url, { method: "POST", headers, body, signal: options?.signal });
    }
    return fetch(url, { method: "POST", headers, body, signal: options?.signal });
}

export async function fetchAnthropicModelIds(config: { baseUrl: string; apiKey: string }) {
    const response = await fetchUpstreamJson(anthropicApiUrl(config.baseUrl, "/models"), anthropicHeaders(config.apiKey));
    return parseAnthropicModelIds(response);
}

function toAnthropicMessages(messages: AnthropicChatMessage[], extraSystem?: string) {
    const systemParts: string[] = [];
    if (extraSystem?.trim()) systemParts.push(extraSystem.trim());

    const converted: AnthropicMessage[] = [];
    const push = (role: "user" | "assistant", content: string | AnthropicContentBlock[]) => {
        const normalized = normalizeContent(content);
        if (!normalized) return;
        const last = converted[converted.length - 1];
        // Anthropic rejects consecutive same-role turns — always coalesce, even across string/array shapes.
        if (last && last.role === role) {
            const prev = toBlockList(last.content);
            const next = toBlockList(normalized);
            last.content = [...prev, ...next];
            return;
        }
        converted.push({ role, content: normalized });
    };

    for (const message of messages) {
        if (message.role === "system") {
            const text = contentToText(message.content);
            if (text) systemParts.push(text);
            continue;
        }
        if (message.role === "tool") {
            push("user", [{ type: "tool_result", tool_use_id: message.tool_call_id, content: message.content }]);
            continue;
        }
        if (message.role === "assistant" && "tool_calls" in message && message.tool_calls?.length) {
            const blocks: AnthropicContentBlock[] = [];
            const text = contentToText(message.content);
            if (text) blocks.push({ type: "text", text });
            for (const call of message.tool_calls) {
                blocks.push({
                    type: "tool_use",
                    id: call.id,
                    name: call.name,
                    input: parseJsonObject(call.arguments),
                });
            }
            push("assistant", blocks);
            continue;
        }
        if (message.role === "assistant") {
            push("assistant", toContentBlocks(message.content));
            continue;
        }
        push("user", toContentBlocks(message.content));
    }

    // Anthropic requires at least one user turn, and the first message must be from the user.
    if (!converted.length) {
        converted.push({ role: "user", content: "(continue)" });
    } else if (converted[0].role !== "user") {
        converted.unshift({ role: "user", content: "(continue)" });
    }

    return { system: systemParts.filter(Boolean).join("\n\n"), messages: converted };
}

function toContentBlocks(content: string | AnthropicChatContentPart[] | null | undefined): string | AnthropicContentBlock[] {
    if (content == null) return "";
    if (!Array.isArray(content)) return String(content);
    return content.flatMap((part): AnthropicContentBlock[] => {
        if (part.type === "text") return part.text ? [{ type: "text", text: part.text }] : [];
        const url = part.image_url?.url || "";
        const match = url.match(/^data:([^;,]+);base64,(.+)$/);
        if (match) {
            return [{ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }];
        }
        if (url) return [{ type: "image", source: { type: "url", url } }];
        return [];
    });
}

function contentToText(content: string | AnthropicChatContentPart[] | null | undefined) {
    if (content == null) return "";
    if (!Array.isArray(content)) return String(content || "").trim();
    return content
        .map((part) => (part.type === "text" ? part.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
}

function normalizeContent(content: string | AnthropicContentBlock[]) {
    if (typeof content === "string") return content.trim() ? content : "";
    return content.length ? content : "";
}

function toBlockList(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
    if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];
    return content;
}

function parseJsonObject(value: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value || "{}");
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function parseNonStreamPayload(payload: Record<string, unknown>): AnthropicChatTurn {
    const errorMessage = readError(payload);
    if (errorMessage) throw new Error(errorMessage);
    const contentBlocks = Array.isArray(payload.content) ? payload.content : [];
    let text = "";
    const toolCalls: AnthropicChatToolCall[] = [];
    for (const block of contentBlocks) {
        if (!isRecord(block)) continue;
        if (block.type === "text" && typeof block.text === "string") text += block.text;
        if (block.type === "tool_use" && typeof block.name === "string" && block.name) {
            toolCalls.push({
                id: typeof block.id === "string" ? block.id : `call_${block.name}`,
                name: block.name,
                arguments: JSON.stringify(isRecord(block.input) ? block.input : {}),
            });
        }
    }
    return { content: text, toolCalls };
}

function consumeStreamText(state: StreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function consumeBlock(block: string, state: StreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(data) as Record<string, unknown>;
    } catch {
        return;
    }
    const errorMessage = readError(event);
    if (errorMessage) {
        state.error = errorMessage;
        return;
    }
    const type = typeof event.type === "string" ? event.type : "";
    if (type === "content_block_start") {
        const contentBlock = isRecord(event.content_block) ? event.content_block : undefined;
        if (contentBlock?.type === "tool_use") {
            const index = typeof event.index === "number" ? event.index : state.toolCalls.size;
            state.toolCalls.set(index, {
                id: typeof contentBlock.id === "string" ? contentBlock.id : `call_${index}`,
                name: typeof contentBlock.name === "string" ? contentBlock.name : "",
                arguments: "",
            });
        }
        return;
    }
    if (type === "content_block_delta") {
        const delta = isRecord(event.delta) ? event.delta : undefined;
        if (!delta) return;
        if (delta.type === "text_delta" && typeof delta.text === "string" && delta.text) {
            state.text += delta.text;
            onDelta?.(state.text);
            return;
        }
        if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
            const index = typeof event.index === "number" ? event.index : 0;
            const current = state.toolCalls.get(index) || { id: `call_${index}`, name: "", arguments: "" };
            current.arguments += delta.partial_json;
            state.toolCalls.set(index, current);
        }
        return;
    }
    if (type === "error") {
        state.error = readError(event) || "Anthropic stream error";
    }
}

function parseAnthropicModelIds(payload: unknown) {
    if (!payload || typeof payload !== "object") return [] as string[];
    const data = (payload as { data?: unknown }).data;
    if (!Array.isArray(data)) return [] as string[];
    return data
        .map((item) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
                return (item as { id: string }).id.trim();
            }
            return "";
        })
        .filter(Boolean);
}

async function fetchUpstreamJson(url: string, headers: Record<string, string>) {
    const { isTauri } = await import("@canvas/services/fs-store");
    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const response = await tauriFetch(url, { method: "GET", headers });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text.slice(0, 200) || `HTTP ${response.status}`);
        }
        return response.json();
    }
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text.slice(0, 200) || `HTTP ${response.status}`);
    }
    return response.json();
}

async function readFetchError(response: Response) {
    const text = await response.text();
    try {
        return readError(JSON.parse(text) as Record<string, unknown>) || text.slice(0, 300) || `HTTP ${response.status}`;
    } catch {
        return text.slice(0, 300) || `HTTP ${response.status}`;
    }
}

function readError(payload: Record<string, unknown>) {
    if (typeof payload.message === "string" && payload.message) return payload.message;
    const error = isRecord(payload.error) ? payload.error : undefined;
    if (error && typeof error.message === "string") return error.message;
    if (error && typeof error.type === "string" && typeof error.message !== "string") {
        return error.type;
    }
    return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
