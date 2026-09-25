import type { NavigateFunction } from "react-router-dom";

import i18n from "@canvas/i18n";
import { isSiteTool, runSiteTool, type SiteToolName } from "@canvas/lib/agent/agent-site-tools";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "@canvas/lib/canvas/canvas-agent-ops";
import { isMcpToolName } from "@canvas/lib/mcp/mcp-client";
import { callMcpTool, mcpAgentTools } from "@canvas/stores/use-mcp-client-store";
import { useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import { randomId } from "@canvas/lib/utils";
import type { ResponseFunctionTool } from "@canvas/services/api/image";
import { useAgentStore, type AgentPermissionMode } from "@canvas/stores/use-agent-store";

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
                description: "Get the current canvas snapshot: nodes (id/type/title/position/metadata), connections, selection, and viewport.",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "canvas_apply_ops",
                description:
                    "Apply operations to the open canvas. Each op in ops[] is one of: {type:'add_node',nodeType?,title?,x?,y?,width?,height?,metadata?} | {type:'update_node',id,metadata?|patch?} | {type:'delete_node',id?|ids?|nodeType?} | {type:'connect_nodes',fromNodeId,toNodeId} | {type:'delete_connections',id?|ids?|all?} | {type:'set_viewport',viewport:{x,y,zoom}} | {type:'select_nodes',ids[]} | {type:'run_generation',nodeId,mode?('text'|'image'|'video'|'audio'),prompt?}. nodeType values come from the canvas node registry (e.g. 'text','image','video','audio'). Returns the updated snapshot.",
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

/** System prompt describing the built-in agent's canvas capabilities. */
export function builtinAgentSystemPrompt(hasCanvas: boolean): string {
    const base = i18n.t("agent.builtin.systemPrompt", {
        defaultValue:
            "You are the built-in canvas agent of this app. You can call tools to inspect and modify the canvas, search prompts and assets, and drive image/video generation. For multi-step tasks call update_plan first to outline steps, then update it as steps complete. When a use_skill tool is available, activate the relevant skill before doing that kind of work.",
    });
    if (!hasCanvas) return base;
    return `${base}\n${i18n.t("agent.builtin.systemPromptCanvas", {
        defaultValue:
            "Canvas rules: use canvas_get_state first to see current nodes. Create/update/connect/delete nodes via canvas_apply_ops. Chain image -> video workflows by connecting nodes, then run_generation. Node ids come from the snapshot — never invent ids. Prefer small batches of ops and verify with canvas_get_state after large changes. canvas_apply_ops returns an audit report: check `skipped` for failed ops (with reasons) and fix them in the next round; use `createdNodeIds` for follow-up connect_nodes; run_generation is queued — poll generation_get_status to verify.",
    })}`;
}

/** Dispatch a tool call for the built-in agent. */
export async function runBuiltinAgentTool(name: string, args: Record<string, unknown>, navigate: NavigateFunction): Promise<unknown> {
    const canvasContext = useAgentStore.getState().canvasContext;
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
        case "canvas_get_state": {
            const snapshot = canvasContext?.snapshot;
            if (!snapshot) throw new Error(i18n.t("agent.mcp.noCanvas"));
            return snapshot;
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
            };
        }
        case "canvas_undo_ops": {
            const undoOps = canvasContext?.undoOps;
            if (!undoOps || !canvasContext?.canUndo) throw new Error(i18n.t("agent.mcp.nothingToUndo"));
            return undoOps();
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
