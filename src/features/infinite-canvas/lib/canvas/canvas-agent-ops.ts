import { nanoid } from "nanoid";

import i18n from "@canvas/i18n";
import { getNodeSpec as getBuiltinNodeSpec } from "@canvas/constant/canvas";
import { normalizeStoryboard } from "@canvas/lib/canvas/canvas-storyboard";
import { getNodeSpec, isBuiltinNodeType, isRegisteredNodeType } from "@canvas/lib/canvas/node-registry";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type CanvasNodeTypeId, type ViewportTransform } from "@canvas/types/canvas";

export type CanvasAgentOp =
    | { type: "add_node"; id?: string; nodeType?: CanvasNodeTypeId; title?: string; position?: { x: number; y: number }; x?: number; y?: number; width?: number; height?: number; metadata?: CanvasNodeMetadata }
    | { type: "update_node"; id: string; patch?: Partial<CanvasNodeData>; metadata?: CanvasNodeMetadata }
    | { type: "delete_node"; id?: string; ids?: string[]; nodeType?: CanvasNodeTypeId }
    | { type: "delete_connections"; id?: string; ids?: string[]; all?: boolean }
    | { type: "connect_nodes"; id?: string; fromNodeId: string; toNodeId: string }
    | { type: "set_viewport"; viewport: ViewportTransform }
    | { type: "select_nodes"; ids: string[] }
    | { type: "run_generation"; nodeId: string; mode?: "text" | "image" | "video" | "audio"; prompt?: string };

export type CanvasAgentSnapshot = {
    projectId: string;
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    viewport: ViewportTransform;
};

export function summarizeCanvasAgentOps(ops?: CanvasAgentOp[]) {
    const counts = (Array.isArray(ops) ? ops : []).reduce<Record<string, number>>((acc, op) => {
        if (!op?.type) return acc;
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts)
        .map(([type, count]) => `${opLabel(type)} ${count}`)
        .join("，");
}

export function applyCanvasAgentOps(snapshot: CanvasAgentSnapshot, ops?: CanvasAgentOp[]) {
    let nodes = snapshot.nodes;
    let connections = snapshot.connections;
    let selectedNodeIds = snapshot.selectedNodeIds;
    let viewport = snapshot.viewport;

    (Array.isArray(ops) ? ops : []).forEach((op, index) => {
        if (!op?.type) return;
        if (op.type === "add_node") {
            const nodeType = resolveAgentNodeType(op.nodeType);
            const spec = resolveAgentNodeSpec(nodeType);
            const metadata = withScriptStoryboard(
                nodeType,
                mirrorGenerationPrompt(nodeType, { ...spec.metadata, ...op.metadata }),
            );
            const node: CanvasNodeData = {
                id: op.id || `${nodeType}-${Date.now()}-${index}`,
                type: nodeType,
                title: op.title || spec.title,
                position: op.position || { x: op.x ?? index * 36, y: op.y ?? index * 36 },
                width: op.width || spec.width,
                height: op.height || spec.height,
                metadata,
            };
            // Same id → replace (avoids duplicate Script nodes when the model retries add_node).
            const existing = nodes.findIndex((item) => item.id === node.id);
            nodes = existing >= 0 ? nodes.map((item, i) => (i === existing ? node : item)) : [...nodes, node];
            selectedNodeIds = [node.id];
        }
        if (op.type === "update_node") {
            if (!op.id) return;
            nodes = nodes.map((node) => {
                if (node.id !== op.id) return node;
                const merged: CanvasNodeData = {
                    ...node,
                    ...op.patch,
                    metadata: { ...node.metadata, ...op.patch?.metadata, ...op.metadata },
                };
                return {
                    ...merged,
                    metadata: withScriptStoryboard(merged.type, mirrorGenerationPrompt(merged.type, merged.metadata || {})),
                };
            });
        }
        if (op.type === "delete_node") {
            const ids = new Set(op.ids || (op.id ? [op.id] : op.nodeType ? nodes.filter((node) => node.type === op.nodeType).map((node) => node.id) : []));
            nodes = nodes.filter((node) => !ids.has(node.id));
            connections = connections.filter((conn) => !ids.has(conn.fromNodeId) && !ids.has(conn.toNodeId));
            selectedNodeIds = selectedNodeIds.filter((id) => !ids.has(id));
        }
        if (op.type === "delete_connections") {
            const ids = new Set(op.ids || (op.id ? [op.id] : []));
            connections = op.all ? [] : connections.filter((conn) => !ids.has(conn.id));
        }
        if (op.type === "connect_nodes") {
            if (!op.fromNodeId || !op.toNodeId) return;
            const exists = connections.some((conn) => conn.fromNodeId === op.fromNodeId && conn.toNodeId === op.toNodeId);
            const hasNodes = nodes.some((node) => node.id === op.fromNodeId) && nodes.some((node) => node.id === op.toNodeId);
            if (!exists && hasNodes) connections = [...connections, { id: op.id || nanoid(), fromNodeId: op.fromNodeId, toNodeId: op.toNodeId }];
        }
        if (op.type === "set_viewport" && op.viewport) viewport = op.viewport;
        if (op.type === "select_nodes") selectedNodeIds = (op.ids || []).filter((id) => nodes.some((node) => node.id === id));
    });

    return { ...snapshot, nodes, connections, selectedNodeIds, viewport };
}

function resolveAgentNodeType(nodeType?: CanvasNodeTypeId) {
    if (nodeType && (isRegisteredNodeType(nodeType) || isBuiltinNodeType(nodeType))) return nodeType;
    return CanvasNodeType.Text;
}

function resolveAgentNodeSpec(nodeType: CanvasNodeTypeId) {
    if (isRegisteredNodeType(nodeType)) return getNodeSpec(nodeType);
    if (isBuiltinNodeType(nodeType)) {
        const spec = getBuiltinNodeSpec(nodeType);
        return { width: spec.width, height: spec.height, title: spec.title, metadata: spec.metadata || {} };
    }
    return getNodeSpec(nodeType);
}

/** Keep image/video/audio prompt fields in sync so UI + generation both see agent updates. */
function mirrorGenerationPrompt(nodeType: CanvasNodeTypeId, metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    if (
        nodeType !== CanvasNodeType.Image &&
        nodeType !== CanvasNodeType.Video &&
        nodeType !== CanvasNodeType.Audio &&
        nodeType !== CanvasNodeType.Text
    ) {
        return metadata;
    }
    const prompt = typeof metadata.prompt === "string" ? metadata.prompt : undefined;
    const composer = typeof metadata.composerContent === "string" ? metadata.composerContent : undefined;
    const content = typeof metadata.content === "string" && nodeType === CanvasNodeType.Text ? metadata.content : undefined;
    if (nodeType === CanvasNodeType.Text) {
        const text = composer ?? prompt ?? content;
        if (typeof text !== "string") return metadata;
        return { ...metadata, content: text, prompt: text, composerContent: text };
    }
    const text = composer ?? prompt;
    if (typeof text !== "string") return metadata;
    return { ...metadata, prompt: text, composerContent: text };
}

function withScriptStoryboard(nodeType: CanvasNodeTypeId, metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    if (nodeType !== CanvasNodeType.Script) return metadata;
    return {
        ...metadata,
        workflowKind: metadata.workflowKind || "storyboard",
        storyboard: normalizeStoryboard(metadata.storyboard),
    };
}

function opLabel(type: string) {
    return i18n.t(`canvas.agentOps.${type}`, { defaultValue: type });
}
