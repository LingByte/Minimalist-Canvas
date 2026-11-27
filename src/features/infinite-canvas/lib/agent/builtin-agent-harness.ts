import type { NavigateFunction } from "react-router-dom";

import { buildBuiltinAgentSystemPrompt } from "@canvas/lib/agent/builtin-agent-context";
import {
    BUILTIN_AGENT_TOOLS,
    executeBuiltinAgentTool,
    type BuiltinAgentToolCall,
    type BuiltinAgentToolResult,
} from "@canvas/lib/agent/builtin-agent-tools";
import {
    requestBuiltinAgentChatTurn,
    type BuiltinAgentChatMessage,
} from "@canvas/services/api/builtin-agent-chat";
import type { AiConfig } from "@canvas/stores/use-config-store";
import type { AgentCanvasContext, AgentChatItem } from "@canvas/stores/use-agent-store";
import { randomId } from "@canvas/lib/utils";

export const BUILTIN_AGENT_MAX_TOOL_ROUNDS = 8;

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
    canvasContext: AgentCanvasContext | null;
    navigate: NavigateFunction;
    signal?: AbortSignal;
    handlers: BuiltinAgentHarnessHandlers;
}) {
    const { config, history, userText, canvasContext, navigate, signal, handlers } = options;
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
        { role: "user", content: userText },
    ];

    let finalText = "";
    for (let round = 0; round < BUILTIN_AGENT_MAX_TOOL_ROUNDS; round += 1) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        messages[0] = { role: "system", content: buildBuiltinAgentSystemPrompt(liveSnapshot) };
        const assistantId = randomId();
        handlers.onActivity?.(`thinking:${round + 1}`);
        handlers.onAssistantDelta(assistantId, "");

        let turn;
        try {
            turn = await requestBuiltinAgentChatTurn(
                config,
                messages,
                BUILTIN_AGENT_TOOLS,
                (text) => handlers.onAssistantDelta(assistantId, text),
                { signal },
            );
        } catch (error) {
            // Some relays reject tool schemas; fall back to context-only chat once.
            const message = error instanceof Error ? error.message : String(error);
            if (round === 0 && /tool|function.?call|not support|unsupported|invalid/i.test(message)) {
                turn = await requestBuiltinAgentChatTurn(
                    config,
                    messages,
                    [],
                    (text) => handlers.onAssistantDelta(assistantId, text),
                    { signal },
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
            handlers.onToolStart({
                id: toolItemId,
                role: "tool",
                title: call.name,
                text: call.name,
                detail: { kind: "builtin_tool", status: "running", name: call.name, arguments: safeJson(call.arguments) },
            });
            handlers.onActivity?.(call.name);
            // Prefer store's latest canvasContext (bridge may have refreshed) while keeping liveSnapshot.
            const storeContext = liveContext;
            const result = await executeBuiltinAgentTool(call, { canvasContext: storeContext, navigate });
            if (result.ok && result.result && typeof result.result === "object" && result.result !== null && "nodeCount" in result.result) {
                // applyOps already updated liveSnapshot via wrapper
            } else if (call.name === "canvas_get_state" || call.name === "canvas_get_selection") {
                liveSnapshot = storeContext?.snapshot || liveSnapshot;
            }
            handlers.onToolFinish(toolItemId, {
                text: result.summary,
                detail: {
                    kind: "builtin_tool",
                    status: result.ok ? "completed" : "failed",
                    name: call.name,
                    result: result.result,
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
        return {
            ok: result.ok,
            name: result.name,
            summary: result.summary,
            text: (result.result as { text: string }).text,
            found: Boolean((result.result as { found?: boolean }).found),
            query: (result.result as { query?: string }).query || "",
            title: (result.result as { entry?: { title?: string } }).entry?.title || "",
        };
    }
    return {
        ok: result.ok,
        name: result.name,
        summary: result.summary,
        result: result.result,
    };
}

function safeJson(raw: string) {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return raw;
    }
}

export type { BuiltinAgentToolCall };
