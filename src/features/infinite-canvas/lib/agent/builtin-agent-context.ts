import type { CanvasAgentSnapshot } from "@canvas/lib/canvas/canvas-agent-ops";
import type { CanvasNodeData } from "@canvas/types/canvas";

const MAX_NODE_SUMMARY = 48;
const MAX_TEXT_CHARS = 180;

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
    return [
        "You are Canvas Agent, a ReAct-style assistant inside an infinite canvas product.",
        "You can read and mutate the current canvas through tools. Prefer tools over guessing.",
        "Workflow: think → call tools when needed → observe results → reply to the user.",
        "When the user asks to create storyboards, prompts, nodes, or generation flows, use canvas tools.",
        "If you see unfamiliar Chinese memes, slang, or abbreviations, call search_meme_wiki before guessing.",
        "Keep replies concise in the user's language. After mutating the canvas, briefly summarize what changed.",
        "Never invent node IDs; read state/selection first when unsure.",
        "",
        "Current canvas context (compact JSON):",
        JSON.stringify(state),
    ].join("\n");
}

function compactNode(node: CanvasNodeData) {
    const metadata = node.metadata || {};
    const text = truncate(String(metadata.content || metadata.composerContent || metadata.prompt || ""), MAX_TEXT_CHARS);
    return {
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
        text: text || undefined,
    };
}

function truncate(value: string, max: number) {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}
