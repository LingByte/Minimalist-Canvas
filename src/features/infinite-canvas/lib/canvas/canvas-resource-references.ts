import { imageReferenceLabel } from "@canvas/lib/image-reference-prompt";
import i18n from "@canvas/i18n";
import { getNodeDefinition } from "@canvas/lib/canvas/node-registry";
import { getDataUrlByteSize, readImageMeta } from "@canvas/lib/image-utils";
import { imageToDataUrl } from "@canvas/services/image-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@canvas/types/canvas";

export type CanvasResourceKind = "image" | "video" | "audio" | "text";

export type CanvasResourceReference = {
    id: string;
    nodeId: string;
    kind: CanvasResourceKind;
    label: string;
    title: string;
    previewUrl?: string;
    text?: string;
    active: boolean;
};

/**
 * @ candidates for a node prompt: every resource already on the canvas
 * (not only wired ones). `active` marks currently connected inputs so the
 * chip UI can keep wired refs highlighted; selecting an inactive candidate
 * should auto-connect then insert `@[node:id]`.
 */
export function buildNodeMentionReferences(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const connectedIds = new Set(getMentionResourceNodes(node.id, nodes, connections).map((item) => item.id));
    const eligible = nodes
        .filter((item) => item.id !== node.id && isResourceNode(item))
        .sort((left, right) => resourceKindRank(resourceKind(left)) - resourceKindRank(resourceKind(right)));
    return labelResourceNodes(eligible).map((reference) => ({
        ...reference,
        active: connectedIds.has(reference.nodeId),
    }));
}

export function buildCanvasResourceReferences(nodes: CanvasNodeData[]) {
    return labelResourceNodes(nodes).map((reference) => ({ ...reference, active: true }));
}

/** Replace chip tokens (`@[node:id]`) with the human labels used in workbench logs and model prompts. */
export function expandCanvasResourceMentions(prompt: string, references: CanvasResourceReference[]) {
    const byId = new Map(references.map((item) => [item.nodeId, item]));
    return prompt.replace(/@\[node:([^\]]+)\]/g, (token, nodeId: string) => byId.get(nodeId)?.label || token);
}

/** Unique `@[node:id]` targets in prompt order (chip / composer serialization). */
export function parsePromptReferencedNodeIds(prompt: string): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        const id = match[1];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

/**
 * Same target resolution as @ auto-wire: image/video consumers that edit via a
 * linked Config receive references on the Config node, not the consumer.
 */
export function resolveMentionConnectionTarget(consumerNodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const consumer = nodes.find((node) => node.id === consumerNodeId);
    if (!consumer || consumer.type === CanvasNodeType.Config) return consumerNodeId;
    const configTarget = connections
        .map((connection) => {
            if (connection.fromNodeId !== consumerNodeId) return null;
            return nodes.find((node) => node.id === connection.toNodeId && node.type === CanvasNodeType.Config) || null;
        })
        .find(Boolean);
    return configTarget?.id || consumerNodeId;
}

/**
 * Drop resource→consumer edges for `@[node:id]` chips that left the prompt.
 * Manual wires never mentioned in the prompt are left alone.
 */
export function pruneRemovedMentionConnections(
    consumerNodeId: string,
    previousPrompt: string,
    nextPrompt: string,
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
): CanvasConnection[] {
    const previousIds = new Set(parsePromptReferencedNodeIds(previousPrompt));
    const nextIds = new Set(parsePromptReferencedNodeIds(nextPrompt));
    const removedIds = [...previousIds].filter((id) => !nextIds.has(id));
    if (!removedIds.length) return connections;

    const targetId = resolveMentionConnectionTarget(consumerNodeId, nodes, connections);
    const removed = new Set(removedIds);
    const resourceIds = new Set(nodes.filter((node) => isResourceNode(node)).map((node) => node.id));

    return connections.filter((connection) => {
        if (connection.toNodeId !== targetId) return true;
        if (!removed.has(connection.fromNodeId)) return true;
        if (!resourceIds.has(connection.fromNodeId)) return true;
        return false;
    });
}

export async function resolveCanvasReferenceImages(references: CanvasResourceReference[], nodes: CanvasNodeData[]) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    return Promise.all(references.filter((reference) => reference.kind === "image").map(async (reference) => {
        const node = nodesById.get(reference.nodeId);
        if (!node) throw new Error(i18n.t("agent.composer.mentions.resourceMissing", { title: reference.title }));
        const metadata = node.metadata;
        const dataUrl = await imageToDataUrl({ storageKey: metadata?.storageKey, url: reference.previewUrl });
        if (!dataUrl.startsWith("data:image/")) throw new Error(i18n.t("agent.composer.mentions.imageReadFailed", { title: reference.title }));
        const meta = metadata?.naturalWidth && metadata.naturalHeight
            ? { width: metadata.naturalWidth, height: metadata.naturalHeight, mimeType: metadata.mimeType || dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" }
            : await readImageMeta(dataUrl);
        return {
            id: `canvas:${node.id}`,
            name: reference.title,
            type: metadata?.mimeType || meta.mimeType,
            size: metadata?.bytes || getDataUrlByteSize(dataUrl),
            width: meta.width,
            height: meta.height,
            url: reference.previewUrl || dataUrl,
            dataUrl,
        };
    }));
}

export function getMentionResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections);
    if (ownInputs.length) return ownInputs;
    const node = nodes.find((item) => item.id === nodeId);
    return node && isResourceNode(node) ? [node] : [];
}

export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections);
    if (ownInputs.length) return ownInputs;
    return [];
}

function getContextResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node && isResourceNode(node)));
}

function getConnectedConfigResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configConnection = connections.find((connection) => connection.fromNodeId === nodeId && nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config);
    if (!configConnection) return [];
    return getContextResourceNodes(configConnection.toNodeId, nodes, connections).filter((node) => node.id !== nodeId);
}

function labelResourceNodes(nodes: CanvasNodeData[]) {
    const counts: Record<CanvasResourceKind, number> = { image: 0, video: 0, audio: 0, text: 0 };
    return nodes.flatMap((node): CanvasResourceReference[] => {
        const kind = resourceKind(node);
        if (!kind) return [];
        const resource = getNodeDefinition(node.type)?.resource?.(node);
        const index = counts[kind]++;
        const label = labelForKind(kind, index);
        return [
            {
                id: node.id,
                nodeId: node.id,
                kind,
                label,
                title: node.title || label,
                previewUrl: node.metadata?.content || resource?.url,
                text: resourceText(node),
                active: false,
            },
        ];
    });
}

function resourceKindRank(kind: CanvasResourceKind | null) {
    if (kind === "image") return 0;
    if (kind === "video") return 1;
    if (kind === "audio") return 2;
    if (kind === "text") return 3;
    return 9;
}

function labelForKind(kind: CanvasResourceKind, index: number) {
    if (kind === "image") return imageReferenceLabel(index);
    if (kind === "video") return i18n.t("canvas.configNode.videoReferences") + ` ${index + 1}`;
    if (kind === "audio") return i18n.t("canvas.configNode.audioReferences") + ` ${index + 1}`;
    return i18n.t("canvas.composer.resources.text", { index: index + 1 });
}

function isResourceNode(node: CanvasNodeData) {
    return Boolean(resourceKind(node));
}

function resourceText(node: CanvasNodeData): string | undefined {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt;
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    return resource?.kind === "text" ? resource.text : undefined;
}

function resourceKind(node: CanvasNodeData): CanvasResourceKind | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return "image";
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return "video";
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return "audio";
    if (node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)) return "text";
    // Plugin nodes declare their input eligibility through definition.resource.
    return getNodeDefinition(node.type)?.resource?.(node)?.kind || null;
}
