import i18n from "@canvas/i18n";
import type { BuiltinAgentToolCall, BuiltinAgentToolDefinition } from "@canvas/lib/agent/builtin-agent-tools";
import {
    buildUsageRequest,
    estimateTextTokens,
    parseProviderUsage,
    resolveUsageRequestPath,
    summarizeMessagesForUsage,
    trackUsageWithTokens,
    type TokenUsage,
} from "@canvas/services/usage-meter";
import { buildApiUrl, resolveModelRequestConfig, type AiConfig } from "@canvas/stores/use-config-store";
import {
    requestAnthropicMessages,
    toAnthropicTools,
    type AnthropicChatMessage,
} from "./anthropic";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

export type BuiltinAgentContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

export type BuiltinAgentChatMessage =
    | { role: "system" | "user" | "assistant"; content: string | BuiltinAgentContentPart[] }
    | { role: "assistant"; content: string | BuiltinAgentContentPart[]; tool_calls: BuiltinAgentToolCall[] }
    | { role: "tool"; tool_call_id: string; content: string };

export type BuiltinAgentChatTurn = {
    content: string;
    toolCalls: BuiltinAgentToolCall[];
    usage?: TokenUsage | null;
};

type StreamState = {
    buffer: string;
    text: string;
    toolCalls: Map<number, { id: string; name: string; arguments: string }>;
    usage?: TokenUsage | null;
    error?: string;
};

export type BuiltinAgentToolChoice = "auto" | "required";

export async function requestBuiltinAgentChatTurn(
    config: AiConfig,
    messages: BuiltinAgentChatMessage[],
    tools: BuiltinAgentToolDefinition[],
    onDelta: (text: string) => void,
    options?: { signal?: AbortSignal; toolChoice?: BuiltinAgentToolChoice },
): Promise<BuiltinAgentChatTurn> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const toolChoice = options?.toolChoice === "required" ? "required" : "auto";
    const startedAt = Date.now();
    const promptChars = estimateMessageChars(messages);
    try {
        let turn: BuiltinAgentChatTurn;
        if (requestConfig.apiFormat === "anthropic") {
            const anthropicTurn = await requestAnthropicMessages(
                requestConfig,
                messages as AnthropicChatMessage[],
                toAnthropicTools(tools),
                onDelta,
                { signal: options?.signal, toolChoice },
            );
            turn = {
                content: anthropicTurn.content,
                toolCalls: anthropicTurn.toolCalls.map((call) => ({
                    id: call.id,
                    name: call.name,
                    arguments: call.arguments,
                })),
                usage: anthropicTurn.usage,
            };
        } else {
            const response = await fetch(buildApiUrl(requestConfig.baseUrl, "/chat/completions"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    Authorization: `Bearer ${requestConfig.apiKey}`,
                },
                body: JSON.stringify({
                    model: requestConfig.model,
                    messages: toWireMessages(messages),
                    tools: tools.length ? tools : undefined,
                    tool_choice: tools.length ? toolChoice : undefined,
                    stream: true,
                    stream_options: { include_usage: true },
                }),
                signal: options?.signal,
            });
            if (!response.ok) throw new Error(await readFetchError(response, apiText("requestFailed")));
            if (!response.body) {
                const payload = (await response.json()) as Record<string, unknown>;
                turn = parseNonStreamPayload(payload);
            } else {
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
                turn = {
                    content: state.text,
                    toolCalls: [...state.toolCalls.entries()]
                        .sort((a, b) => a[0] - b[0])
                        .map(([, item]) => ({
                            id: item.id || `call_${item.name || "tool"}`,
                            name: item.name,
                            arguments: item.arguments || "{}",
                        }))
                        .filter((item) => item.name),
                    usage: state.usage || null,
                };
            }
        }
        const usage =
            turn.usage ||
            estimateTextTokens(promptChars, turn.content.length);
        const agentPath =
            requestConfig.apiFormat === "anthropic"
                ? resolveUsageRequestPath(requestConfig.baseUrl || "https://api.anthropic.com", "/messages")
                : resolveUsageRequestPath(requestConfig.baseUrl, "/chat/completions");
        trackUsageWithTokens({
            capability: "text",
            model: requestConfig.model,
            origin: "agent",
            status: "success",
            durationMs: Date.now() - startedAt,
            tokens: usage,
            request: buildUsageRequest({
                method: "POST",
                path: agentPath,
                prompt: summarizeMessagesForUsage(messages),
                response: turn.content,
                params: [
                    "agent",
                    tools.length ? `tools=${tools.length}` : null,
                    turn.toolCalls.length ? `tool_calls=${turn.toolCalls.length}` : null,
                    `messages=${messages.length}`,
                ],
            }),
        });
        return { ...turn, usage };
    } catch (error) {
        const agentPath =
            requestConfig.apiFormat === "anthropic"
                ? resolveUsageRequestPath(requestConfig.baseUrl || "https://api.anthropic.com", "/messages")
                : resolveUsageRequestPath(requestConfig.baseUrl, "/chat/completions");
        trackUsageWithTokens({
            capability: "text",
            model: requestConfig.model,
            origin: "agent",
            status: "failed",
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            tokens: estimateTextTokens(promptChars, 0),
            request: buildUsageRequest({
                method: "POST",
                path: agentPath,
                prompt: summarizeMessagesForUsage(messages),
                params: ["agent", tools.length ? `tools=${tools.length}` : null, `messages=${messages.length}`],
            }),
        });
        throw error;
    }
}

function toWireMessages(messages: BuiltinAgentChatMessage[]) {
    return messages.map((message) => {
        if (message.role === "tool") {
            return { role: "tool", tool_call_id: message.tool_call_id, content: message.content };
        }
        if (message.role === "assistant" && "tool_calls" in message && message.tool_calls?.length) {
            return {
                role: "assistant",
                content: message.content || null,
                tool_calls: message.tool_calls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: { name: call.name, arguments: call.arguments },
                })),
            };
        }
        return { role: message.role, content: message.content };
    });
}

function parseNonStreamPayload(payload: Record<string, unknown>): BuiltinAgentChatTurn {
    const errorMessage = readError(payload);
    if (errorMessage) throw new Error(errorMessage);
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = isRecord(choices[0]) ? choices[0] : undefined;
    const message = first && isRecord(first.message) ? first.message : undefined;
    const content = message && typeof message.content === "string" ? message.content : "";
    const rawCalls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const toolCalls = rawCalls.flatMap((item): BuiltinAgentToolCall[] => {
        if (!isRecord(item)) return [];
        const fn = isRecord(item.function) ? item.function : undefined;
        const name = fn && typeof fn.name === "string" ? fn.name : "";
        if (!name) return [];
        return [
            {
                id: typeof item.id === "string" ? item.id : `call_${name}`,
                name,
                arguments: fn && typeof fn.arguments === "string" ? fn.arguments : "{}",
            },
        ];
    });
    return { content, toolCalls, usage: parseProviderUsage(payload) };
}

function estimateMessageChars(messages: BuiltinAgentChatMessage[]) {
    return messages.reduce((sum, message) => {
        if (typeof message.content === "string") return sum + message.content.length;
        if (Array.isArray(message.content)) {
            return (
                sum +
                message.content.reduce((inner, part) => {
                    if (part.type === "text") return inner + part.text.length;
                    return inner + 64;
                }, 0)
            );
        }
        return sum;
    }, 0);
}

function consumeStreamText(state: StreamState, text: string, onDelta: (text: string) => void, flush = false) {
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

function consumeBlock(block: string, state: StreamState, onDelta: (text: string) => void) {
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
    const usage = parseProviderUsage(event);
    if (usage) state.usage = { ...(state.usage || {}), ...usage };
    const choices = Array.isArray(event.choices) ? event.choices : [];
    for (const choice of choices) {
        if (!isRecord(choice)) continue;
        const delta = isRecord(choice.delta) ? choice.delta : undefined;
        const message = isRecord(choice.message) ? choice.message : undefined;
        const piece =
            (delta && typeof delta.content === "string" ? delta.content : "") ||
            (message && typeof message.content === "string" ? message.content : "");
        if (piece) {
            state.text += piece;
            onDelta(state.text);
        }
        const toolDeltas = (delta && Array.isArray(delta.tool_calls) ? delta.tool_calls : [])
            .concat(message && Array.isArray(message.tool_calls) ? message.tool_calls : []);
        for (const item of toolDeltas) {
            if (!isRecord(item)) continue;
            const index = typeof item.index === "number" ? item.index : state.toolCalls.size ? Math.max(...state.toolCalls.keys()) : 0;
            const current = state.toolCalls.get(index) || { id: "", name: "", arguments: "" };
            if (typeof item.id === "string" && item.id) current.id = item.id;
            const fn = isRecord(item.function) ? item.function : undefined;
            // Some relays put name/arguments on the tool_call itself.
            const name =
                (fn && typeof fn.name === "string" ? fn.name : "") ||
                (typeof item.name === "string" ? item.name : "");
            if (name) current.name = name;
            const objectArgs =
                (fn && fn.arguments && typeof fn.arguments === "object" ? fn.arguments : null) ||
                (item.arguments && typeof item.arguments === "object" ? item.arguments : null) ||
                (item.input && typeof item.input === "object" ? item.input : null);
            if (objectArgs) {
                current.arguments = JSON.stringify(objectArgs);
            } else {
                const argPiece =
                    (fn && typeof fn.arguments === "string" ? fn.arguments : "") ||
                    (typeof item.arguments === "string" ? item.arguments : "") ||
                    (typeof item.input === "string" ? item.input : "");
                if (argPiece) current.arguments += argPiece;
            }
            state.toolCalls.set(index, current);
        }
    }
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    try {
        return readError(JSON.parse(text) as Record<string, unknown>) || text.slice(0, 300) || fallback;
    } catch {
        return text.slice(0, 300) || fallback;
    }
}

function readError(payload: Record<string, unknown>) {
    if (typeof payload.message === "string" && payload.message) return payload.message;
    const error = isRecord(payload.error) ? payload.error : undefined;
    if (error && typeof error.message === "string") return error.message;
    return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
