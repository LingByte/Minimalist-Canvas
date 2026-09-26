import { getNodeSpec } from "@canvas/constant/canvas";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@canvas/types/canvas";
import { buildCanvasResourceReferences } from "@canvas/lib/canvas/canvas-resource-references";
import { createCanvasNode } from "@canvas/lib/canvas/canvas-node-factory";

export type StoryboardShot = {
    /** Shot number as written (digits preserved). */
    number: string;
    /** Header used as the node title, e.g. "镜号 3". */
    label: string;
    /** Full shot block text. */
    text: string;
    /** Asset reference tokens found inside this shot. */
    assetRefs: string[];
};

export type ParsedStoryboard = {
    /** Text before the first shot marker — global rules + reference-asset section. */
    preamble: string;
    /** Asset reference tokens found in the preamble (apply to every shot). */
    preambleAssetRefs: string[];
    shots: StoryboardShot[];
};

// Shot headers: 镜号 3｜ / 镜头 2: / SHOT 4 | / Scene 1
const SHOT_MARKER = /(?:^|\n)\s*(镜号|镜头|分镜|SHOT|SCENE|Shot|Scene)\s*([0-9０-９]+)\s*[｜|：:]?/g;
// Asset mentions: 图片 1 / 视频2 / Image 3 / Text 2 (canvas resource labels).
const ASSET_REF = /(?:图片|视频|音频|文本|Image|Video|Audio|Text)\s*([0-9０-９]+)/g;

function collectAssetRefs(text: string): string[] {
    const found = new Set<string>();
    for (const match of text.matchAll(ASSET_REF)) {
        const token = match[0].replace(/\s+/g, "").trim();
        if (token) found.add(token);
    }
    return [...found];
}

export function parseStoryboard(raw: string): ParsedStoryboard {
    const text = raw.trim();
    const matches = [...text.matchAll(SHOT_MARKER)];
    if (!matches.length) return { preamble: "", preambleAssetRefs: [], shots: [] };
    const preamble = text.slice(0, matches[0].index).trim();
    const shots = matches.map((match, index) => {
        const markerStart = match.index! + (match[0].search(/\S/) || 0);
        const end = index + 1 < matches.length ? matches[index + 1].index! : text.length;
        const block = text.slice(markerStart, end).trim();
        const label = `${match[1]} ${match[2]}`;
        return { number: match[2], label, text: block, assetRefs: collectAssetRefs(block) };
    });
    return { preamble, preambleAssetRefs: collectAssetRefs(preamble), shots };
}

function normalizeRefToken(token: string) {
    return token.replace(/\s+/g, "").toLowerCase();
}

/** Map asset reference tokens (图片1 / Image 2 / exact node titles) to canvas resource node ids. */
export function resolveStoryboardAssetIds(tokens: string[], nodes: CanvasNodeData[]): string[] {
    if (!tokens.length) return [];
    const references = buildCanvasResourceReferences(nodes);
    const idByLabel = new Map(references.map((reference) => [normalizeRefToken(reference.label), reference.nodeId]));
    const idByTitle = new Map(references.filter((reference) => reference.title?.trim()).map((reference) => [reference.title.trim().toLowerCase(), reference.nodeId]));
    const ids = new Set<string>();
    for (const token of tokens) {
        const id = idByLabel.get(normalizeRefToken(token)) ?? idByTitle.get(token.trim().toLowerCase());
        if (id) ids.add(id);
    }
    return [...ids];
}

export type StoryboardImportResult = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    connectedAssetIds: string[];
};

const SHOTS_PER_ROW = 4;
const GRID_GAP = 48;

/**
 * Build video nodes for every parsed shot (prompt = preamble + shot block so the
 * shared rules travel with each node) plus reference-asset connections.
 * Preamble refs wire into every shot; per-shot refs only into their own node.
 */
export function buildStoryboardImport(parsed: ParsedStoryboard, center: { x: number; y: number }, nodes: CanvasNodeData[], newId: () => string): StoryboardImportResult {
    const spec = getNodeSpec(CanvasNodeType.Video);
    const rows = Math.ceil(parsed.shots.length / SHOTS_PER_ROW);
    const cols = Math.min(parsed.shots.length, SHOTS_PER_ROW);
    const startX = center.x - (cols * spec.width + (cols - 1) * GRID_GAP) / 2 + spec.width / 2;
    const startY = center.y - (rows * spec.height + (rows - 1) * GRID_GAP) / 2 + spec.height / 2;
    const globalAssetIds = resolveStoryboardAssetIds(parsed.preambleAssetRefs, nodes);
    const existing = new Set(nodes.map((node) => node.id));
    const createdNodes: CanvasNodeData[] = [];
    const createdConnections: CanvasConnection[] = [];
    const connectedAssetIds = new Set<string>();
    const linked = new Set<string>();

    parsed.shots.forEach((shot, index) => {
        const position = {
            x: startX + (index % SHOTS_PER_ROW) * (spec.width + GRID_GAP),
            y: startY + Math.floor(index / SHOTS_PER_ROW) * (spec.height + GRID_GAP),
        };
        const prompt = parsed.preamble ? `${parsed.preamble}\n\n${shot.text}` : shot.text;
        const node = createCanvasNode(CanvasNodeType.Video, position, { prompt, composerContent: prompt });
        node.title = shot.label;
        createdNodes.push(node);
        const assetIds = new Set([...globalAssetIds, ...resolveStoryboardAssetIds(shot.assetRefs, nodes)]);
        for (const assetId of assetIds) {
            if (!existing.has(assetId) || assetId === node.id) continue;
            const key = `${assetId}->${node.id}`;
            if (linked.has(key)) continue;
            linked.add(key);
            connectedAssetIds.add(assetId);
            createdConnections.push({ id: newId(), fromNodeId: assetId, toNodeId: node.id });
        }
    });

    return { nodes: createdNodes, connections: createdConnections, connectedAssetIds: [...connectedAssetIds] };
}
