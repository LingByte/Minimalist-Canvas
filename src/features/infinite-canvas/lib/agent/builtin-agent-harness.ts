import type { NavigateFunction } from "react-router-dom";

import { toolCallDetail, toolName } from "@canvas/components/agent/agent-event-formatters";
import { buildBuiltinAgentSystemPrompt } from "@canvas/lib/agent/builtin-agent-context";
import {
    builtinAgentTools,
    executeBuiltinAgentTool,
    type BuiltinAgentToolCall,
    type BuiltinAgentToolDefinition,
    type BuiltinAgentToolResult,
} from "@canvas/lib/agent/builtin-agent-tools";
import {
    requestBuiltinAgentChatTurn,
    type BuiltinAgentChatMessage,
    type BuiltinAgentContentPart,
} from "@canvas/services/api/builtin-agent-chat";
import type { AiConfig } from "@canvas/stores/use-config-store";
import type { AgentAttachment, AgentCanvasContext, AgentChatItem } from "@canvas/stores/use-agent-store";
import { randomId } from "@canvas/lib/utils";

export const BUILTIN_AGENT_MAX_TOOL_ROUNDS = 12;

export type BuiltinAgentHarnessHandlers = {
    onAssistantDelta: (assistantId: string, text: string) => void;
    onAssistantFinalize: (assistantId: string, text: string) => void;
    onToolStart: (item: AgentChatItem) => void;
    onToolFinish: (itemId: string, patch: Partial<AgentChatItem>) => void;
    onActivity?: (text: string) => void;
};

export async function runBuiltinAgentHarness(options: {
    config: AiConfig;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    userText: string;
    attachments?: AgentAttachment[];
    canvasContext: AgentCanvasContext | null;
    navigate: NavigateFunction;
    signal?: AbortSignal;
    handlers: BuiltinAgentHarnessHandlers;
}) {
    const { config, history, userText, attachments = [], canvasContext, navigate, signal, handlers } = options;
    let liveSnapshot = canvasContext?.snapshot || null;
    const liveContext: AgentCanvasContext | null = canvasContext
        ? {
              ...canvasContext,
              get snapshot() {
                  return liveSnapshot || canvasContext.snapshot;
              },
              applyOps: (ops) => {
                  const next = canvasContext.applyOps(ops);
                  liveSnapshot = next;
                  return next;
              },
          }
        : null;

    const messages: BuiltinAgentChatMessage[] = [
        { role: "system", content: buildBuiltinAgentSystemPrompt(liveSnapshot) },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: "user", content: buildUserContent(userText, attachments) },
    ];

    let finalText = "";
    // Rebuild each turn so shipped/user skills land in use_skill after store.load().
    const tools = () => builtinAgentTools(true) as BuiltinAgentToolDefinition[];
    for (let round = 0; round < BUILTIN_AGENT_MAX_TOOL_ROUNDS; round += 1) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        messages[0] = { role: "system", content: buildBuiltinAgentSystemPrompt(liveSnapshot) };
        const assistantId = randomId();
        handlers.onActivity?.(`thinking:${round + 1}`);

        let turn;
        try {
            turn = await requestBuiltinAgentChatTurnWithRetry(
                config,
                messages,
                tools(),
                (text) => {
                    if (text.trim()) handlers.onAssistantDelta(assistantId, text);
                },
                signal,
            );
        } catch (error) {
            // Some relays reject tool schemas; fall back to context-only chat once.
            const message = error instanceof Error ? error.message : String(error);
            if (round === 0 && /tool|function.?call|not support|unsupported|invalid/i.test(message)) {
                turn = await requestBuiltinAgentChatTurnWithRetry(
                    config,
                    messages,
                    [],
                    (text) => {
                        if (text.trim()) handlers.onAssistantDelta(assistantId, text);
                    },
                    signal,
                );
                finalText = turn.content || "";
                handlers.onAssistantFinalize(assistantId, finalText);
                return { text: finalText, toolRounds: 0, toolsDisabled: true };
            }
            throw error;
        }
        finalText = turn.content || "";
        handlers.onAssistantFinalize(assistantId, finalText);

        if (!turn.toolCalls.length) {
            return { text: finalText, toolRounds: round };
        }

        messages.push({
            role: "assistant",
            content: finalText,
            tool_calls: turn.toolCalls,
        });

        for (const call of turn.toolCalls) {
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            const toolItemId = randomId();
            const label = toolName(call.name);
            const argsJson = safeJson(call.arguments);
            handlers.onToolStart({
                id: toolItemId,
                role: "tool",
                title: label,
                text: "",
                detail: {
                    ...toolCallDetail(call.name, call.arguments, "running"),
                    kind: "builtin_tool",
                    name: call.name,
                    arguments: argsJson,
                },
            });
            handlers.onActivity?.(label);
            // Prefer store's latest canvasContext (bridge may have refreshed) while keeping liveSnapshot.
            const storeContext = liveContext;
            const result = await executeBuiltinAgentTool(call, { canvasContext: storeContext, navigate });
            if (call.name === "canvas_apply_ops" && result.ok) {
                // liveSnapshot is updated by liveContext.applyOps; also accept compact state payloads.
                liveSnapshot = storeContext?.snapshot || liveSnapshot;
            } else if (call.name === "canvas_get_state" || call.name === "canvas_get_selection" || call.name === "canvas_undo_ops") {
                liveSnapshot = storeContext?.snapshot || liveSnapshot;
            }
            const status = result.ok ? "completed" : "failed";
            handlers.onToolFinish(toolItemId, {
                text: result.summary,
                detail: {
                    ...toolCallDetail(call.name, call.arguments, status, result.ok ? "" : result.summary),
                    kind: "builtin_tool",
                    name: call.name,
                    arguments: argsJson,
                    result: result.result,
                    output: formatBuiltinToolOutput(call.name, result),
                },
            });
            messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(serializeToolResult(result)),
            });
        }
    }

    return { text: finalText, toolRounds: BUILTIN_AGENT_MAX_TOOL_ROUNDS };
}

function serializeToolResult(result: BuiltinAgentToolResult) {
    // Prefer the human-readable meme wiki text for the model when present.
    if (
        result.name === "search_meme_wiki" &&
        result.result &&
        typeof result.result === "object" &&
        typeof (result.result as { text?: unknown }).text === "string"
    ) {
        const payload = result.result as {
            text: string;
            found?: boolean;
            query?: string;
            mode?: string;
            entry?: { title?: string };
            hits?: Array<{ title?: string; tags?: string; usage?: string }>;
        };
        return {
            ok: result.ok,
            name: result.name,
            summary: result.summary,
            text: payload.text,
            found: Boolean(payload.found),
            mode: payload.mode || "lookup",
            query: payload.query || "",
            title: payload.entry?.title || "",
            hits: Array.isArray(payload.hits)
                ? payload.hits.slice(0, 12).map((hit) => ({
                      title: hit.title || "",
                      tags: hit.tags || "",
                      usage: hit.usage || "",
                  }))
                : undefined,
        };
    }
    return {
        ok: result.ok,
        name: result.name,
        summary: result.summary,
        result: result.result,
    };
}

function formatBuiltinToolOutput(name: string, result: BuiltinAgentToolResult) {
    if (!result.ok) return result.summary || "failed";
    if (name === "search_meme_wiki" && result.result && typeof result.result === "object") {
        const hit = result.result as {
            text?: string;
            found?: boolean;
            mode?: string;
            query?: string;
            entry?: { title?: string };
            hits?: Array<{ title?: string }>;
        };
        if (typeof hit.text === "string" && hit.text.trim()) return hit.text.trim().slice(0, 2400);
        if (Array.isArray(hit.hits) && hit.hits.length) {
            return hit.hits
                .slice(0, 8)
                .map((item) => item.title)
                .filter(Boolean)
                .join("、");
        }
        return result.summary;
    }
    if (name === "canvas_get_state" || name === "canvas_get_selection") {
        return compactJson(result.result, 2400);
    }
    if (name === "canvas_apply_ops") {
        return compactJson(result.result, 2400);
    }
    if (result.summary) return result.summary;
    return compactJson(result.result, 1800);
}

function compactJson(value: unknown, max = 1800) {
    try {
        const text = JSON.stringify(value, null, 2);
        if (!text) return "";
        return text.length <= max ? text : `${text.slice(0, max)}…`;
    } catch {
        return String(value ?? "");
    }
}

function safeJson(raw: string) {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return raw;
    }
}

function isTransientNetworkError(error: unknown) {
    const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
    return (
        message === "load failed" ||
        message.includes("network connection was lost") ||
        message.includes("failed to fetch") ||
        message.includes("networkerror") ||
        message.includes("err_network") ||
        message.includes("econnreset") ||
        message.includes("etimedout") ||
        message.includes("socket hang up")
    );
}

async function requestBuiltinAgentChatTurnWithRetry(
    config: Parameters<typeof requestBuiltinAgentChatTurn>[0],
    messages: Parameters<typeof requestBuiltinAgentChatTurn>[1],
    tools: Parameters<typeof requestBuiltinAgentChatTurn>[2],
    onDelta: Parameters<typeof requestBuiltinAgentChatTurn>[3],
    signal?: AbortSignal,
) {
    try {
        return await requestBuiltinAgentChatTurn(config, messages, tools, onDelta, { signal });
    } catch (error) {
        if (signal?.aborted || !isTransientNetworkError(error)) throw error;
        // One quiet retry for flaky relays / brief disconnects.
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (signal?.aborted) throw error;
        return requestBuiltinAgentChatTurn(config, messages, tools, onDelta, { signal });
    }
}

function buildUserContent(userText: string, attachments: AgentAttachment[]): string | BuiltinAgentContentPart[] {
    const images = attachments.filter((item) => item.type.startsWith("image/") && item.url);
    const files = attachments.filter((item) => !item.type.startsWith("image/") && item.url);
    let text = userText.trim();
    if (files.length) {
        const lines = files.map((item) => `- ${item.name || "file"} (${item.type || "application/octet-stream"}): ${item.url}`).join("\n");
        text = [text, text ? "" : null, "Attached files (object storage URLs):", lines].filter((item) => item !== null).join("\n");
    }
    if (!images.length) return text || userText;
    const parts: BuiltinAgentContentPart[] = [
        { type: "text", text: text || "Please review the attached image(s)." },
        ...images.map((item) => ({ type: "image_url" as const, image_url: { url: item.url } })),
    ];
    return parts;
}

export type { BuiltinAgentToolCall };
