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
    hasReActActions,
    parseReActActions,
    stripReActBlocks,
} from "@canvas/lib/agent/react-parser";
import {
    requestBuiltinAgentChatTurn,
    type BuiltinAgentChatMessage,
    type BuiltinAgentContentPart,
    type BuiltinAgentToolChoice,
} from "@canvas/services/api/builtin-agent-chat";
import type { AiConfig } from "@canvas/stores/use-config-store";
import type { AgentAttachment, AgentCanvasContext, AgentChatItem } from "@canvas/stores/use-agent-store";
import { randomId } from "@canvas/lib/utils";

export const BUILTIN_AGENT_MAX_TOOL_ROUNDS = 12;
const MAX_NO_TOOL_RETRIES = 2;

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
    let toolsDisabled = false;
    let noToolRetries = 0;
    const actionIntent = detectCanvasActionIntent(userText);
    let forceTools = actionIntent;
    // Only advertise canvas tools when a canvas is actually open.
    const tools = () => builtinAgentTools(Boolean(liveContext?.snapshot)) as BuiltinAgentToolDefinition[];

    for (let round = 0; round < BUILTIN_AGENT_MAX_TOOL_ROUNDS; round += 1) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        messages[0] = { role: "system", content: buildBuiltinAgentSystemPrompt(liveSnapshot) };
        const assistantId = randomId();
        handlers.onActivity?.(`thinking:${round + 1}`);
        const activeTools = tools();
        const toolChoice: BuiltinAgentToolChoice =
            forceTools && activeTools.length ? "required" : "auto";

        let turn;
        try {
            turn = await requestBuiltinAgentChatTurnWithRetry(
                config,
                messages,
                activeTools,
                (text) => {
                    if (text.trim()) handlers.onAssistantDelta(assistantId, text);
                },
                signal,
                toolChoice,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const toolProtocolError = /tool|function.?call|not support|unsupported|invalid|tool_choice/i.test(message);
            // Relays that reject tool_choice=required: retry once with auto.
            if (toolChoice === "required" && activeTools.length && toolProtocolError) {
                forceTools = false;
                turn = await requestBuiltinAgentChatTurnWithRetry(
                    config,
                    messages,
                    activeTools,
                    (text) => {
                        if (text.trim()) handlers.onAssistantDelta(assistantId, text);
                    },
                    signal,
                    "auto",
                );
            } else if (round === 0 && activeTools.length && toolProtocolError) {
                // Some relays reject tool schemas entirely; fall back to context-only chat once.
                toolsDisabled = true;
                turn = await requestBuiltinAgentChatTurnWithRetry(
                    config,
                    messages,
                    [],
                    (text) => {
                        if (text.trim()) handlers.onAssistantDelta(assistantId, text);
                    },
                    signal,
                    "auto",
                );
                finalText = turn.content || "";
                handlers.onAssistantFinalize(assistantId, finalText);
                return { text: finalText, toolRounds: 0, toolsDisabled: true };
            } else {
                throw error;
            }
        }

        // Models without native tool_calls sometimes emit ReAct text — convert before giving up.
        if (!turn.toolCalls.length && activeTools.length && hasReActActions(turn.content || "")) {
            const reactCalls = parseReActActions(turn.content || "");
            const known = new Set(activeTools.map((tool) => tool.function.name));
            const converted = reactCalls
                .filter((call) => known.has(call.name))
                .map((call) => ({
                    id: `react_${call.name}_${randomId()}`,
                    name: call.name,
                    arguments: JSON.stringify(call.args || {}),
                }));
            if (converted.length) {
                turn = {
                    content: stripReActBlocks(turn.content || ""),
                    toolCalls: converted,
                };
            }
        }

        finalText = turn.content || "";

        if (!turn.toolCalls.length) {
            const claimed = looksLikeClaimedMutation(finalText);
            const shouldRetry =
                activeTools.length > 0 &&
                noToolRetries < MAX_NO_TOOL_RETRIES &&
                (actionIntent || claimed);
            if (shouldRetry) {
                noToolRetries += 1;
                forceTools = true;
                // Drop the hallucinated bubble; keep model text in history for the nudge round.
                handlers.onAssistantFinalize(assistantId, "");
                messages.push({ role: "assistant", content: finalText || "(no tool calls)" });
                messages.push({
                    role: "user",
                    content: [
                        "STOP. You described canvas/world changes but did NOT call any tools.",
                        "You MUST call tools now. Do not claim success in text and do not paste prompts only in chat.",
                        "Typical sequence: canvas_get_state → canvas_update_node_prompts (for existing node prompts) and/or canvas_apply_ops (and run_generation only if asked).",
                        "Use real node ids from canvas_get_state. Prefer one canvas_update_node_prompts batch. Reply with tool calls only until mutations succeed.",
                    ].join("\n"),
                });
                handlers.onActivity?.(`retry-tools:${noToolRetries}`);
                continue;
            }
            handlers.onAssistantFinalize(assistantId, finalText);
            return { text: finalText, toolRounds: round, toolsDisabled };
        }

        handlers.onAssistantFinalize(assistantId, finalText);
        forceTools = false;
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
            const storeContext = liveContext;
            const result = await executeBuiltinAgentTool(call, { canvasContext: storeContext, navigate });
            if (
                (call.name === "canvas_apply_ops" || call.name === "canvas_update_node_prompts") &&
                result.ok
            ) {
                liveSnapshot = storeContext?.snapshot || liveSnapshot;
            } else if (
                call.name === "canvas_get_state" ||
                call.name === "canvas_get_selection" ||
                call.name === "canvas_undo_ops"
            ) {
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

    return { text: finalText, toolRounds: BUILTIN_AGENT_MAX_TOOL_ROUNDS, toolsDisabled };
}

/** User likely wants the agent to mutate or inspect the canvas via tools. */
export function detectCanvasActionIntent(text: string) {
    const value = text.trim();
    if (!value) return false;
    return /创建|添加|新增|更新|修改|改写|改一下|优化|润色|重写|填充|写入|补全|设置|删除|移除|连接|连线|分镜|剧本|节点|提示词|生图|生成|导出|撤销|undo|create|add|update|edit|rewrite|polish|optimize|fill|set|delete|remove|connect|storyboard|script|node|prompt|generate|canvas_apply_ops|canvas_update_node_prompts|run_generation/i.test(
        value,
    );
}

function looksLikeClaimedMutation(text: string) {
    const value = text.trim();
    if (!value) return false;
    return /已(经)?(完成)?(更新|创建|修改|写入|填充|添加|删除|连接|生成|优化|润色)|prompts?\s+(have been|were|are)\s+(updated|filled|set|rewritten|optimized)|successfully\s+(updated|created|added|modified|optimized)|我已经(把|将)|节点的提示词已|提示词(已经|都)?(写好|更新|改好)/i.test(
        value,
    );
}

function serializeToolResult(result: BuiltinAgentToolResult) {
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
        if ((hit.mode === "search" || hit.mode === "pack") && Array.isArray(hit.hits)) {
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
    if (name === "canvas_apply_ops" || name === "canvas_update_node_prompts") {
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
    toolChoice: BuiltinAgentToolChoice = "auto",
) {
    try {
        return await requestBuiltinAgentChatTurn(config, messages, tools, onDelta, { signal, toolChoice });
    } catch (error) {
        if (signal?.aborted || !isTransientNetworkError(error)) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (signal?.aborted) throw error;
        return requestBuiltinAgentChatTurn(config, messages, tools, onDelta, { signal, toolChoice });
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
