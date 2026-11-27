import type { NavigateFunction } from "react-router-dom";

import i18n from "@canvas/i18n";
import { isSiteTool, runSiteTool, type SiteToolName } from "@canvas/lib/agent/agent-site-tools";
import { compactCanvasSnapshot } from "@canvas/lib/agent/builtin-agent-context";
import { searchMemeWiki } from "@canvas/lib/agent/meme-wiki";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "@canvas/lib/canvas/canvas-agent-ops";
import { isMcpToolName } from "@canvas/lib/mcp/mcp-client";
import { callMcpTool, mcpAgentTools } from "@canvas/stores/use-mcp-client-store";
import { useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import { randomId } from "@canvas/lib/utils";
import type { ResponseFunctionTool } from "@canvas/services/api/image";
import { useAgentStore, type AgentCanvasContext, type AgentPermissionMode } from "@canvas/stores/use-agent-store";

export type BuiltinAgentToolDefinition = {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};

export type BuiltinAgentToolCall = {
    id: string;
    name: string;
    arguments: string;
};

export type BuiltinAgentToolResult = {
    callId: string;
    name: string;
    ok: boolean;
    summary: string;
    result: unknown;
};

/**
 * Built-in agent tools — mirror the MCP server's tool list (src-tauri/src/mcp.rs)
 * so the side-panel agent can drive the canvas without an external Codex process.
 */
export function builtinAgentTools(hasCanvas: boolean): ResponseFunctionTool[] {
    const skills = useBuiltinSkillStore.getState().skills;
    const metaTools: ResponseFunctionTool[] = [
        {
            type: "function",
            function: {
                name: "update_plan",
                description: "Maintain a visible step-by-step plan. Call at task start for multi-step work and again whenever a step completes. tasks[] items: {step: string, status: 'pending'|'inProgress'|'completed'|'failed'}.",
                parameters: {
                    type: "object",
                    properties: {
                        tasks: { type: "array", items: { type: "object", properties: { step: { type: "string" }, status: { type: "string" } } } },
                        explanation: { type: "string" },
                    },
                    required: ["tasks"],
                },
            },
        },
    ];
    if (skills.length) {
        metaTools.push({
            type: "function",
            function: {
                name: "use_skill",
                description: `Activate a local skill's instructions. Available skills: ${skills.map((skill) => `${skill.name}${skill.description ? ` — ${skill.description}` : ""}`).join("; ")}.`,
                parameters: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                },
            },
        });
    }
    const tools: ResponseFunctionTool[] = [
        {
            type: "function",
            function: {
                name: "canvas_list_projects",
                description: "List saved canvas projects.",
                parameters: {
                    type: "object",
                    properties: {
                        keyword: { type: "string" },
                        page: { type: "number" },
                        pageSize: { type: "number" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "generation_get_status",
                description: "Get generation task status across canvas/workbench. scope: 'all'|'canvas'|'image'|'video'.",
                parameters: {
                    type: "object",
                    properties: {
                        scope: { type: "string" },
                        taskId: { type: "string" },
                        nodeIds: { type: "array", items: { type: "string" } },
                        limit: { type: "number" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "prompts_search",
                description: "Search the prompt library.",
                parameters: {
                    type: "object",
                    properties: {
                        keyword: { type: "string" },
                        category: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        page: { type: "number" },
                        pageSize: { type: "number" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "search_meme_wiki",
                description:
                    "Local Chinese meme wiki (~6800 entries). mode=lookup (default): one entry by name/alias. mode=search: ranked multi-hit cards for a keyword. mode=pack: theme pack for storyboards (校园/职场/抽象/短视频…). For meme short dramas: pack/search first, then write Script rows that actually 接梗.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Meme name, slang, keyword, or theme (for pack)" },
                        mode: {
                            type: "string",
                            description: "lookup | search | pack",
                            enum: ["lookup", "search", "pack"],
                        },
                        limit: { type: "number", description: "Max hits for search/pack (1-12, default 6)" },
                        tags: { type: "string", description: "Optional extra tag filters for pack, comma-separated" },
                    },
                    required: ["query"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "assets_list",
                description: "List saved assets. kind: 'all'|'text'|'image'|'video'.",
                parameters: {
                    type: "object",
                    properties: {
                        kind: { type: "string" },
                        keyword: { type: "string" },
                        page: { type: "number" },
                        pageSize: { type: "number" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "assets_add",
                description: "Add an asset. kind 'text' requires title+content; kind 'image' requires title+imageUrl.",
                parameters: {
                    type: "object",
                    properties: {
                        kind: { type: "string" },
                        title: { type: "string" },
                        content: { type: "string" },
                        imageUrl: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        note: { type: "string" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "workbench_image_get_config",
                description: "Get current image-workbench config and selectable models/options.",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "workbench_image_generate",
                description: "Configure and optionally start image generation in the workbench.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string" },
                        model: { type: "string" },
                        quality: { type: "string" },
                        size: { type: "string" },
                        count: { type: "number" },
                        run: { type: "boolean" },
                    },
                },
            },
        },
        {
            type: "function",
            function: {
                name: "workbench_video_get_config",
                description: "Get current video-workbench config and selectable models/options.",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "workbench_video_generate",
                description: "Configure and optionally start video generation in the workbench.",
                parameters: {
                    type: "object",
                    properties: {
                        prompt: { type: "string" },
                        model: { type: "string" },
                        seconds: { type: "string" },
                        size: { type: "string" },
                        resolution: { type: "string" },
                        generateAudio: { type: "boolean" },
                        watermark: { type: "boolean" },
                        run: { type: "boolean" },
                    },
                },
            },
        },
    ];

    if (!hasCanvas) return [...metaTools, ...tools, ...mcpAgentTools()];

    return [
        {
            type: "function",
            function: {
                name: "canvas_get_state",
                description:
                    "Get a compact canvas snapshot for planning: node id/type/title/position, text/prompt excerpts, Script storyboard row summaries (shot/duration/plot/imageNodeId/videoNodeId), connections, selection, and viewport. Prefer this over guessing ids.",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "canvas_apply_ops",
                description:
                    "Apply operations to the open canvas. Ops: {type:'add_node',nodeType?,title?,x?,y?,width?,height?,metadata?} | {type:'update_node',id,metadata?|patch?} | {type:'delete_node',id?|ids?|nodeType?} | {type:'connect_nodes',fromNodeId,toNodeId} | {type:'delete_connections',id?|ids?|all?} | {type:'set_viewport',viewport:{x,y,zoom}} | {type:'select_nodes',ids[]} | {type:'run_generation',nodeId,mode?('text'|'image'|'video'|'audio'),prompt?}. For filling prompts on existing nodes prefer canvas_update_node_prompts. Example update_node: {type:'update_node',id:'image-123',metadata:{prompt:'...',composerContent:'...'}}. nodeType includes 'text','image','video','audio','config','script','director','group'. For storyboards prefer nodeType 'script' with metadata.storyboard.rows[] = [{id?,shotNumber,durationSeconds,plotDescription,imageNodeId?,videoNodeId?}]. Missing script storyboard is auto-initialized. Returns an audit + updated counts.",
                parameters: {
                    type: "object",
                    properties: { ops: { type: "array", items: { type: "object" } } },
                    required: ["ops"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "canvas_update_node_prompts",
                description:
                    "REQUIRED tool when filling/rewriting/optimizing prompts on EXISTING canvas nodes. Prefer this over chat text or canvas_apply_ops update_node. Call canvas_get_state first for real nodeIds, then send one batch items[{nodeId,prompt,title?}]. Writes metadata.prompt + metadata.composerContent (and text content for text nodes). Does NOT start generation. Never claim prompts updated without this tool succeeding.",
                parameters: {
                    type: "object",
                    properties: {
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    nodeId: { type: "string" },
                                    prompt: { type: "string" },
                                    title: { type: "string" },
                                },
                                required: ["nodeId", "prompt"],
                            },
                        },
                    },
                    required: ["items"],
                },
            },
        },
        {
            type: "function",
            function: {
                name: "canvas_undo_ops",
                description: "Undo the most recently applied canvas ops batch.",
                parameters: { type: "object", properties: {} },
            },
        },
        ...tools,
        ...mcpAgentTools(),
        ...metaTools,
    ];
}

/** Dispatch a tool call for the built-in agent. */
export async function runBuiltinAgentTool(
    name: string,
    args: Record<string, unknown>,
    navigate: NavigateFunction,
    canvasContextOverride?: AgentCanvasContext | null,
): Promise<unknown> {
    // Prefer the harness live context so multi-round tool loops see ops applied in this turn.
    const canvasContext = canvasContextOverride ?? useAgentStore.getState().canvasContext;
    switch (name) {
        case "update_plan": {
            // The panel renders the plan card; the model just needs confirmation.
            const tasks = Array.isArray(args.tasks) ? args.tasks : [];
            return { ok: true, tasks: tasks.length };
        }
        case "use_skill": {
            const store = useBuiltinSkillStore.getState();
            const skillName = String(args.name || "").trim();
            const skill = store.skills.find((item) => item.name === skillName);
            if (!skill) throw new Error(i18n.t("agent.builtin.skillNotFound", { name: skillName }));
            store.select(skill.name);
            return { ok: true, skill: skill.name, instructions: skill.instructions };
        }
        case "search_meme_wiki": {
            return searchMemeWiki({
                query: String(args.query || ""),
                mode: typeof args.mode === "string" ? args.mode : undefined,
                limit: args.limit == null ? undefined : Number(args.limit),
                tags: typeof args.tags === "string" ? args.tags : undefined,
            });
        }
        case "canvas_get_state": {
            const snapshot = canvasContext?.snapshot;
            if (!snapshot) throw new Error(i18n.t("agent.mcp.noCanvas"));
            return compactCanvasSnapshot(snapshot);
        }
        case "canvas_apply_ops": {
            const applyOps = canvasContext?.applyOps;
            const snapshot = canvasContext?.snapshot;
            if (!applyOps || !snapshot) throw new Error(i18n.t("agent.mcp.noCanvas"));
            const rawOps = Array.isArray(args.ops) ? (args.ops as CanvasAgentOp[]) : [];
            if (!rawOps.length) throw new Error(i18n.t("agent.mcp.opsRequired"));
            // Pre-assign ids for add_node/connect_nodes so the dry-run audit and the real apply produce identical ids.
            const ops = rawOps.map((op) => {
                if (op?.type === "add_node" && !op.id) return { ...op, id: `${op.nodeType || "text"}-${randomId()}` };
                if (op?.type === "connect_nodes" && !op.id) return { ...op, id: randomId() };
                return op;
            });
            const audit = auditCanvasOps(snapshot, ops);
            const next = applyOps(ops);
            return {
                ...audit,
                nodes: next.nodes.length,
                connections: next.connections.length,
                selectedNodeIds: next.selectedNodeIds,
                state: compactCanvasSnapshot(next),
            };
        }
        case "canvas_update_node_prompts": {
            const applyOps = canvasContext?.applyOps;
            const snapshot = canvasContext?.snapshot;
            if (!applyOps || !snapshot) throw new Error(i18n.t("agent.mcp.noCanvas"));
            const items = Array.isArray(args.items) ? args.items : [];
            if (!items.length) throw new Error(i18n.t("agent.mcp.opsRequired"));
            const known = new Set(snapshot.nodes.map((node) => node.id));
            const ops: CanvasAgentOp[] = [];
            const skipped: Array<{ nodeId: string; reason: string }> = [];
            const updated: string[] = [];
            for (const raw of items) {
                if (!raw || typeof raw !== "object") continue;
                const item = raw as { nodeId?: unknown; prompt?: unknown; title?: unknown };
                const nodeId = String(item.nodeId || "").trim();
                const prompt = typeof item.prompt === "string" ? item.prompt : "";
                const title = typeof item.title === "string" ? item.title.trim() : "";
                if (!nodeId) {
                    skipped.push({ nodeId: "", reason: "missing nodeId" });
                    continue;
                }
                if (!known.has(nodeId)) {
                    skipped.push({ nodeId, reason: "node not found" });
                    continue;
                }
                if (!prompt.trim()) {
                    skipped.push({ nodeId, reason: "empty prompt" });
                    continue;
                }
                updated.push(nodeId);
                ops.push({
                    type: "update_node",
                    id: nodeId,
                    ...(title ? { patch: { title } } : {}),
                    metadata: { prompt, composerContent: prompt },
                });
            }
            if (!ops.length) {
                return { ok: false, updated: [], skipped, reason: "no valid items" };
            }
            const audit = auditCanvasOps(snapshot, ops);
            const next = applyOps(ops);
            return {
                ...audit,
                ok: true,
                updated,
                skipped,
                nodes: next.nodes.length,
                state: compactCanvasSnapshot(next),
            };
        }
        case "canvas_undo_ops": {
            const undoOps = canvasContext?.undoOps;
            if (!undoOps || !canvasContext?.canUndo) throw new Error(i18n.t("agent.mcp.nothingToUndo"));
            const undone = undoOps();
            return undone ? { ok: true, state: compactCanvasSnapshot(undone) } : undone;
        }
        default:
            if (isMcpToolName(name)) return callMcpTool(name, args);
            if (isSiteTool(name)) return runSiteTool(name as SiteToolName, args, navigate, { canvasSnapshot: canvasContext?.snapshot ?? null });
            throw new Error(i18n.t("agent.siteTools.unknownTool", { name }));
    }
}

/** Compact JSON string for a tool result sent back to the model. */
export function toolResultText(result: unknown): string {
    if (typeof result === "string") return result;
    try {
        const text = JSON.stringify(result);
        return text.length > 12000 ? `${text.slice(0, 12000)}…` : text;
    } catch {
        return String(result);
    }
}

/**
 * Whether a tool call needs user confirmation before running.
 * - generation tools (billing) ask in "request" and "automatic" modes
 * - canvas_apply_ops asks when it contains run_generation (both modes) or delete_* (request mode)
 * - mcp__* external tools and canvas_undo_ops ask in "request" mode
 * - "full" mode never asks
 */
export function toolNeedsApproval(name: string, args: Record<string, unknown>, mode: AgentPermissionMode): boolean {
    if (mode === "full") return false;
    if (name === "workbench_image_generate" || name === "workbench_video_generate") return true;
    if (name === "canvas_apply_ops") {
        const ops = Array.isArray(args.ops) ? (args.ops as CanvasAgentOp[]) : [];
        if (ops.some((op) => op?.type === "run_generation")) return true;
        if (mode === "request" && ops.some((op) => op?.type === "delete_node" || op?.type === "delete_connections")) return true;
        return false;
    }
    if (mode !== "request") return false;
    if (name === "canvas_undo_ops" || isMcpToolName(name)) return true;
    return false;
}

/**
 * Dry-run audit for canvas_apply_ops: simulate each op through the pure
 * applyCanvasAgentOps so the model gets a per-op report (applied/skipped +
 * reason + created ids) and can act on it in the next round.
 */
function auditCanvasOps(snapshot: CanvasAgentSnapshot, ops: CanvasAgentOp[]) {
    let sim = snapshot;
    const skipped: Array<{ index: number; type: string; reason: string }> = [];
    const createdNodeIds: string[] = [];
    const createdConnectionIds: string[] = [];
    const generationQueued: string[] = [];

    ops.forEach((op, index) => {
        if (!op?.type) {
            skipped.push({ index, type: "unknown", reason: "missing type" });
            return;
        }
        if (op.type === "run_generation") {
            if (op.nodeId && sim.nodes.some((node) => node.id === op.nodeId)) generationQueued.push(op.nodeId);
            else skipped.push({ index, type: op.type, reason: "target node not found" });
            return;
        }
        const before = sim;
        sim = applyCanvasAgentOps(sim, [op]);
        switch (op.type) {
            case "add_node": {
                const created = sim.nodes.filter((node) => !before.nodes.some((prev) => prev.id === node.id)).map((node) => node.id);
                createdNodeIds.push(...created);
                break;
            }
            case "update_node":
                if (!op.id) skipped.push({ index, type: op.type, reason: "missing id" });
                else if (!before.nodes.some((node) => node.id === op.id)) skipped.push({ index, type: op.type, reason: `node ${op.id} not found` });
                break;
            case "delete_node": {
                const removed = before.nodes.length - sim.nodes.length;
                if (!removed) skipped.push({ index, type: op.type, reason: "no matching nodes" });
                break;
            }
            case "delete_connections": {
                const removed = before.connections.length - sim.connections.length;
                if (!removed) skipped.push({ index, type: op.type, reason: op.all ? "no connections" : "no matching connection ids" });
                break;
            }
            case "connect_nodes": {
                const added = sim.connections.length - before.connections.length;
                if (added) {
                    const created = sim.connections.filter((conn) => !before.connections.some((prev) => prev.id === conn.id)).map((conn) => conn.id);
                    createdConnectionIds.push(...created);
                } else {
                    const reason = !op.fromNodeId || !op.toNodeId
                        ? "missing fromNodeId/toNodeId"
                        : before.connections.some((conn) => conn.fromNodeId === op.fromNodeId && conn.toNodeId === op.toNodeId)
                          ? "already connected"
                          : "endpoint node not found";
                    skipped.push({ index, type: op.type, reason });
                }
                break;
            }
            case "set_viewport":
                if (!op.viewport) skipped.push({ index, type: op.type, reason: "missing viewport" });
                break;
            case "select_nodes": {
                const valid = (op.ids || []).filter((id) => before.nodes.some((node) => node.id === id));
                if (!valid.length) skipped.push({ index, type: op.type, reason: "no matching node ids" });
                break;
            }
            default:
                skipped.push({ index, type: (op as { type?: string }).type || "unknown", reason: "unknown op type" });
        }
    });

    return {
        applied: ops.length - skipped.length,
        skipped,
        createdNodeIds,
        createdConnectionIds,
        generationQueued,
    };
}

export const BUILTIN_AGENT_TOOLS = builtinAgentTools(true) as BuiltinAgentToolDefinition[];

export async function executeBuiltinAgentTool(
    call: BuiltinAgentToolCall,
    ctx: { canvasContext?: AgentCanvasContext | null; navigate: NavigateFunction },
): Promise<BuiltinAgentToolResult> {
    try {
        const parsed = call.arguments ? JSON.parse(call.arguments) : {};
        const args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        const result = await runBuiltinAgentTool(call.name, args, ctx.navigate, ctx.canvasContext);
        const ok = !(result && typeof result === "object" && "ok" in result && (result as { ok?: unknown }).ok === false);
        return {
            callId: call.id,
            name: call.name,
            ok,
            summary: summarizeBuiltinToolResult(call.name, result),
            result,
        };
    } catch (error) {
        const summary = error instanceof Error ? error.message : String(error);
        return { callId: call.id, name: call.name, ok: false, summary, result: { error: summary } };
    }
}

function summarizeBuiltinToolResult(name: string, result: unknown) {
    if (name === "search_meme_wiki" && result && typeof result === "object") {
        const hit = result as {
            ok?: boolean;
            found?: boolean;
            mode?: string;
            query?: string;
            entry?: { title?: string };
            hits?: Array<{ title?: string }>;
            text?: string;
        };
        const mode = String(hit.mode || "lookup");
        if ((mode === "search" || mode === "pack") && Array.isArray(hit.hits)) {
            if (hit.hits.length) {
                return i18n.t("agent.eventMore.memePack", {
                    count: hit.hits.length,
                    query: hit.query || "",
                    defaultValue: `梗素材 ${hit.hits.length} 条 · ${hit.query || mode}`,
                });
            }
            return i18n.t("agent.eventMore.memeMissing", { query: hit.query || "", defaultValue: `未找到「${hit.query || ""}」相关梗` });
        }
        if (hit.found && hit.entry?.title) {
            return i18n.t("agent.eventMore.memeFound", { title: hit.entry.title, defaultValue: `查到「${hit.entry.title}」` });
        }
        if (hit.query) {
            return i18n.t("agent.eventMore.memeMissing", { query: hit.query, defaultValue: `未收录「${hit.query}」` });
        }
        if (typeof hit.text === "string" && hit.text.trim()) return hit.text.trim();
    }
    if (name === "canvas_get_state" || name === "canvas_get_selection") {
        return i18n.t(name === "canvas_get_selection" ? "agent.eventMore.selectionRead" : "agent.eventMore.canvasRead");
    }
    if (name === "canvas_update_node_prompts" && result && typeof result === "object") {
        const data = result as { updated?: unknown[]; skipped?: unknown[] };
        const updated = Array.isArray(data.updated) ? data.updated.length : 0;
        const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
        if (skipped) {
            return i18n.t("agent.eventMore.canvasOpsPartial", {
                applied: updated,
                skipped,
                defaultValue: `已更新 ${updated} 个提示词，跳过 ${skipped} 项`,
            });
        }
        return i18n.t("agent.eventMore.nodePromptsUpdated", {
            count: updated,
            defaultValue: `已更新 ${updated} 个节点提示词`,
        });
    }
    if (name === "canvas_apply_ops" && result && typeof result === "object") {
        const data = result as { applied?: number; skipped?: unknown[]; nodes?: number; connections?: number };
        if (typeof data.applied === "number") {
            const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
            if (skipped) {
                return i18n.t("agent.eventMore.canvasOpsPartial", {
                    applied: data.applied,
                    skipped,
                    defaultValue: `已应用 ${data.applied} 项，跳过 ${skipped} 项`,
                });
            }
            return i18n.t("agent.eventMore.canvasOpsApplied", {
                count: data.applied,
                defaultValue: `已应用 ${data.applied} 项操作`,
            });
        }
    }
    if (name === "canvas_undo_ops") {
        return i18n.t("agent.eventMore.canvasOpsUndone", { defaultValue: "已撤销上一批画布操作" });
    }
    // Prefer a human summary over echoing the raw tool id under the title.
    if (result && typeof result === "object" && typeof (result as { summary?: unknown }).summary === "string") {
        const summary = String((result as { summary: string }).summary).trim();
        if (summary && summary !== name) return summary;
    }
    return "";
}
