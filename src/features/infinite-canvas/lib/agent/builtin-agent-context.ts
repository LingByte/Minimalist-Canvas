import type { CanvasAgentSnapshot } from "@canvas/lib/canvas/canvas-agent-ops";
import { normalizeStoryboard } from "@canvas/lib/canvas/canvas-storyboard";
import { selectedBuiltinSkillPrompt } from "@canvas/stores/use-builtin-skill-store";
import { CanvasNodeType, type CanvasNodeData, type StoryboardData } from "@canvas/types/canvas";

const MAX_NODE_SUMMARY = 48;
const MAX_TEXT_CHARS = 180;
const MAX_STORYBOARD_ROWS = 12;
const MAX_SHOT_PLOT_CHARS = 96;

/** Compact canvas snapshot for system prompt / tool results (keeps token budget under control). */
export function compactCanvasSnapshot(snapshot: CanvasAgentSnapshot | null | undefined, options?: { selectionOnly?: boolean; limit?: number }) {
    if (!snapshot) return { available: false as const, reason: "Canvas is not open" };
    const limit = options?.limit ?? MAX_NODE_SUMMARY;
    const selected = new Set(snapshot.selectedNodeIds || []);
    const sourceNodes = options?.selectionOnly
        ? snapshot.nodes.filter((node) => selected.has(node.id))
        : snapshot.nodes;
    const nodes = sourceNodes.slice(0, limit).map(compactNode);
    return {
        available: true as const,
        projectId: snapshot.projectId,
        title: snapshot.title,
        nodeCount: snapshot.nodes.length,
        connectionCount: snapshot.connections.length,
        selectedNodeIds: snapshot.selectedNodeIds,
        viewport: snapshot.viewport,
        truncated: sourceNodes.length > limit,
        nodes,
        connections: snapshot.connections.slice(0, 80).map((conn) => ({
            id: conn.id,
            from: conn.fromNodeId,
            to: conn.toNodeId,
        })),
    };
}

export function buildBuiltinAgentSystemPrompt(snapshot: CanvasAgentSnapshot | null | undefined) {
    const state = compactCanvasSnapshot(snapshot);
    const skillPrompt = selectedBuiltinSkillPrompt().trim();
    return [
        "You are 至简未来AI, the built-in script / storyboard harness agent inside Minimalist Canvas.",
        "Default mission: turn user ideas into structured screenplays on the canvas, then optional image/video generation.",
        "CRITICAL: Canvas/world changes ONLY happen via tools. Text that claims you updated/created/deleted nodes without a successful tool call in THIS turn is a lie — do not do that.",
        "Workflow: think → CALL TOOLS → observe tool JSON → reply briefly in the user's language (default Chinese).",
        "If the user asks to create/update/fill/rewrite/optimize/delete/connect/generate on the canvas, your FIRST action must be a tool call (usually canvas_get_state, then canvas_update_node_prompts / canvas_apply_ops / run_generation).",
        "Never paste long prompt drafts into chat as a substitute for writing them onto nodes.",
        "",
        "Script harness stages (use update_plan for multi-step work):",
        "1) Clarify genre, length, tone, and cast if missing.",
        "2) Outline story + characters (short).",
        "3) Create or update ONE Script node (nodeType 'script') with metadata.storyboard.rows[].",
        "4) Optionally create Image nodes / connect them / run_generation for key shots.",
        "5) Video generation is optional—suggest it after images exist; do not force a full video run unless asked.",
        "",
        "Meme × storyboard (when user wants 梗短剧 / 玩梗 / 抽象短剧):",
        "- First call search_meme_wiki with mode=pack (theme like 校园/职场/抽象/短视频) or mode=search (keyword) to get 4–8 meme cards.",
        "- Pick 2–4 memes max. Each shot should usually bind at most one primary meme.",
        "- Write the meme into plotDescription as how to 接梗 (dialogue beat / action / camera punchline)—do NOT dump encyclopedia text into the storyboard.",
        "- Use mode=lookup only when you need the exact meaning of one term.",
        "- Optional: activate use_skill name=meme-storyboard when that skill is available.",
        "",
        "Script node contract:",
        "- Prefer nodeType 'script' over many loose text nodes for storyboards.",
        "- metadata.storyboard.rows[] items: {id?, shotNumber, durationSeconds, plotDescription, imageNodeId?, videoNodeId?}.",
        "- Fill plotDescription with concrete shot action, dialogue hints, and camera intent.",
        "- For shot images: add image nodes with metadata.prompt (or composerContent) derived from the shot plot, connect Script→Image, set row.imageNodeId, then run_generation on those image node ids.",
        "- If the user only asks to create an image/video/audio/text node (empty placeholder), call canvas_apply_ops with add_node only. Do NOT call run_generation unless they explicitly ask to generate content.",
        "- To fill / rewrite / optimize prompts on EXISTING nodes: MUST call canvas_update_node_prompts with real nodeIds from canvas_get_state. Prefer one batch items[] covering all target nodes.",
        "- Do not claim prompts were updated unless canvas_update_node_prompts / canvas_apply_ops returned updated node ids.",
        "- Prefer placing new nodes near the current viewport center when position is unspecified.",
        "- Never invent node IDs; call canvas_get_state first when unsure.",
        "- canvas_get_state / apply_ops return compact summaries (including storyboard row digests), not raw media payloads.",
        "- After tools succeed, summarize ONLY what the tool results show (updated/skipped counts and ids). Never invent success.",
        "",
        "If you see unfamiliar Chinese memes/slang, call search_meme_wiki before guessing.",
        "Keep replies concise. Do not open with a generic capability list unless the user asks what you can do.",
        skillPrompt ? `\nActive skill instructions:\n${skillPrompt}` : "",
        "",
        "Current canvas context (compact JSON):",
        JSON.stringify(state),
    ]
        .filter((line) => line !== "")
        .join("\n");
}

function compactNode(node: CanvasNodeData) {
    const metadata = node.metadata || {};
    const prompt = truncate(String(metadata.composerContent || metadata.prompt || ""), MAX_TEXT_CHARS);
    const content = truncate(String(metadata.content || ""), MAX_TEXT_CHARS);
    const base = {
        id: node.id,
        type: node.type,
        title: node.title,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        w: Math.round(node.width),
        h: Math.round(node.height),
        status: metadata.status,
        mode: metadata.generationMode,
        model: metadata.model,
        workflowKind: metadata.workflowKind,
        prompt: prompt || undefined,
        content: content && content !== prompt ? content : undefined,
        // Legacy alias so older skills still see a text excerpt.
        text: prompt || content || undefined,
    };
    if (node.type !== CanvasNodeType.Script) return base;
    return {
        ...base,
        storyboard: compactStoryboard(metadata.storyboard),
    };
}

function compactStoryboard(data?: StoryboardData | null) {
    const storyboard = normalizeStoryboard(data);
    const rows = storyboard.rows.slice(0, MAX_STORYBOARD_ROWS).map((row) => ({
        shot: row.shotNumber,
        duration: row.durationSeconds,
        plot: truncate(row.plotDescription || "", MAX_SHOT_PLOT_CHARS) || undefined,
        imageNodeId: row.imageNodeId || undefined,
        videoNodeId: row.videoNodeId || undefined,
    }));
    return {
        rowCount: storyboard.rows.length,
        truncated: storyboard.rows.length > MAX_STORYBOARD_ROWS,
        rows,
    };
}

function truncate(value: string, max: number) {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}
