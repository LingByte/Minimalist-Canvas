import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ConnectionHandle, type ViewportTransform } from "@canvas/types/canvas";

export function nodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

export function findGroupDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    if (nodes.some((node) => movedIds.has(node.id) && node.type === CanvasNodeType.Group)) return null;
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type !== CanvasNodeType.Group);
    if (!movingNodes.length) return null;
    return (
        [...nodes].reverse().find((group) => {
            if (group.type !== CanvasNodeType.Group || movedIds.has(group.id)) return false;
            return movingNodes.some((node) => {
                const centerX = node.position.x + node.width / 2;
                const centerY = node.position.y + node.height / 2;
                return centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height;
            });
        }) || null
    );
}

export function snapNodesIntoGroup(movedIds: Set<string>, nodes: CanvasNodeData[], group: CanvasNodeData) {
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type !== CanvasNodeType.Group);
    if (!movingNodes.length) return nodes;
    const pad = 24;
    const bounds = nodeBounds(movingNodes);
    const left = group.position.x + pad;
    const top = group.position.y + pad;
    const right = group.position.x + group.width - pad;
    const bottom = group.position.y + group.height - pad;
    const dx = bounds.right - bounds.left > right - left ? left - bounds.left : bounds.left < left ? left - bounds.left : bounds.right > right ? right - bounds.right : 0;
    const dy = bounds.bottom - bounds.top > bottom - top ? top - bounds.top : bounds.top < top ? top - bounds.top : bounds.bottom > bottom ? bottom - bounds.bottom : 0;
    return nodes.map((node) => {
        if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
        return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy }, metadata: { ...node.metadata, groupId: group.id } };
    });
}

export function findContainingGroupId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    return (
        [...nodes]
            .reverse()
            .find((group) => group.type === CanvasNodeType.Group && group.id !== node.id && centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height)?.id ||
        undefined
    );
}

export function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

const ARRANGE_GAP_X = 80;
const ARRANGE_GAP_Y = 48;
const ARRANGE_COMPONENT_GAP = 96;
const ARRANGE_GROUP_PAD = 32;
const ISOLATED_COLUMNS = 2;
const ZONE_ROW_MAX_W = 2200;
const RANK_FILL_BEFORE_WRAP = 4;
const RANK_MAX_COLS = 3;

/**
 * BeefTV-style tidy: connected graphs stay left-to-right by edge rank.
 * Within a rank, nodes fill downward first and wrap to at most three
 * columns. Independent graphs tile into row zones. The previous
 * bounding-box center is preserved so the viewport does not jump.
 */
export function arrangeCanvasNodes(nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    if (nodes.length <= 1) return nodes;

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const working = nodes.filter((node) => node.type !== CanvasNodeType.Group);
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();

    for (const connection of connections) {
        const from = connection.fromNodeId;
        const to = connection.toNodeId;
        if (from === to || !byId.has(from) || !byId.has(to)) continue;
        if (byId.get(from)?.type === CanvasNodeType.Group || byId.get(to)?.type === CanvasNodeType.Group) continue;
        outgoing.set(from, [...(outgoing.get(from) || []), to]);
        incoming.set(to, [...(incoming.get(to) || []), from]);
    }

    const visited = new Set<string>();
    const connected: string[][] = [];
    const isolated: string[] = [];
    for (const node of working) {
        if (visited.has(node.id)) continue;
        const stack = [node.id];
        const component: string[] = [];
        visited.add(node.id);
        while (stack.length) {
            const id = stack.pop()!;
            component.push(id);
            for (const next of [...(outgoing.get(id) || []), ...(incoming.get(id) || [])]) {
                if (visited.has(next) || !byId.has(next) || byId.get(next)?.type === CanvasNodeType.Group) continue;
                visited.add(next);
                stack.push(next);
            }
        }
        const hasEdge = component.some((id) => (outgoing.get(id)?.length || 0) + (incoming.get(id)?.length || 0) > 0);
        if (component.length === 1 && !hasEdge) isolated.push(component[0]);
        else connected.push(component);
    }

    connected.sort((left, right) => {
        let aY = Infinity;
        let aX = Infinity;
        let bY = Infinity;
        let bX = Infinity;
        for (const id of left) {
            const node = byId.get(id)!;
            aY = Math.min(aY, node.position.y);
            aX = Math.min(aX, node.position.x);
        }
        for (const id of right) {
            const node = byId.get(id)!;
            bY = Math.min(bY, node.position.y);
            bX = Math.min(bX, node.position.x);
        }
        return aY - bY || aX - bX;
    });

    const positions = new Map<string, { x: number; y: number }>();
    const zones: { w: number; h: number; local: Map<string, { x: number; y: number }> }[] = [];

    const layoutGraph = (ids: string[]) => {
        const idSet = new Set(ids);
        const layer = new Map<string, number>();
        const remaining = new Set(ids);
        const indeg = new Map<string, number>();
        for (const id of ids) {
            indeg.set(id, (incoming.get(id) || []).filter((parent) => idSet.has(parent)).length);
        }
        while (remaining.size) {
            const ready = [...remaining].filter((id) => (indeg.get(id) || 0) <= 0);
            const pick = ready.length ? ready : [[...remaining].sort((a, b) => (indeg.get(a) || 0) - (indeg.get(b) || 0))[0]];
            for (const id of pick) {
                remaining.delete(id);
                const preds = (incoming.get(id) || []).filter((parent) => idSet.has(parent) && layer.has(parent));
                layer.set(id, preds.length ? Math.max(...preds.map((parent) => layer.get(parent)!)) + 1 : 0);
                for (const child of outgoing.get(id) || []) {
                    if (!remaining.has(child)) continue;
                    indeg.set(child, (indeg.get(child) || 1) - 1);
                }
            }
        }

        const maxLayer = Math.max(0, ...ids.map((id) => layer.get(id) || 0));
        const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
        for (const id of ids) columns[layer.get(id) || 0].push(id);
        for (const column of columns) {
            column.sort((a, b) => byId.get(a)!.position.y - byId.get(b)!.position.y);
        }
        for (let pass = 0; pass < 3; pass++) {
            for (let i = 1; i < columns.length; i++) {
                const prev = columns[i - 1];
                columns[i].sort((a, b) => {
                    const bary = (id: string) => {
                        const preds = (incoming.get(id) || []).filter((parent) => layer.get(parent) === i - 1);
                        if (!preds.length) return columns[i].indexOf(id);
                        return preds.reduce((sum, parent) => sum + Math.max(0, prev.indexOf(parent)), 0) / preds.length;
                    };
                    return bary(a) - bary(b);
                });
            }
        }

        const local = new Map<string, { x: number; y: number }>();
        let layerX = 0;
        let right = 0;
        let bottom = 0;
        for (const column of columns) {
            if (!column.length) continue;
            const gridCols =
                column.length <= RANK_FILL_BEFORE_WRAP
                    ? 1
                    : Math.min(RANK_MAX_COLS, Math.ceil(column.length / RANK_FILL_BEFORE_WRAP));
            const gridRows = Math.ceil(column.length / gridCols);
            const colW = Array.from({ length: gridCols }, () => 0);
            const rowH = Array.from({ length: gridRows }, () => 0);
            for (let i = 0; i < column.length; i++) {
                const node = byId.get(column[i])!;
                const col = Math.floor(i / gridRows);
                const row = i % gridRows;
                colW[col] = Math.max(colW[col], node.width);
                rowH[row] = Math.max(rowH[row], node.height);
            }
            const colX: number[] = [];
            let x = layerX;
            for (let col = 0; col < gridCols; col++) {
                colX[col] = x;
                x += colW[col] + ARRANGE_GAP_X;
            }
            const rowY: number[] = [];
            let y = 0;
            for (let row = 0; row < gridRows; row++) {
                rowY[row] = y;
                y += rowH[row] + ARRANGE_GAP_Y;
            }
            for (let i = 0; i < column.length; i++) {
                const col = Math.floor(i / gridRows);
                const row = i % gridRows;
                local.set(column[i], { x: colX[col], y: rowY[row] });
            }
            right = Math.max(right, colX[gridCols - 1] + colW[gridCols - 1]);
            bottom = Math.max(bottom, rowY[gridRows - 1] + rowH[gridRows - 1]);
            layerX = right + ARRANGE_GAP_X;
        }
        zones.push({ w: right, h: bottom, local });
    };

    for (const ids of connected) layoutGraph(ids);

    if (isolated.length) {
        isolated.sort((a, b) => {
            const left = byId.get(a)!;
            const right = byId.get(b)!;
            return left.position.y - right.position.y || left.position.x - right.position.x;
        });
        const local = new Map<string, { x: number; y: number }>();
        let col = 0;
        let rowY = 0;
        let rowHeight = 0;
        let colX = 0;
        let right = 0;
        let bottom = 0;
        for (const id of isolated) {
            const node = byId.get(id)!;
            if (col >= ISOLATED_COLUMNS) {
                col = 0;
                colX = 0;
                rowY += rowHeight + ARRANGE_GAP_Y;
                rowHeight = 0;
            }
            local.set(id, { x: colX, y: rowY });
            right = Math.max(right, colX + node.width);
            bottom = Math.max(bottom, rowY + node.height);
            colX += node.width + ARRANGE_GAP_X;
            rowHeight = Math.max(rowHeight, node.height);
            col += 1;
        }
        zones.push({ w: right, h: bottom, local });
    }

    let rowX = 0;
    let rowY = 0;
    let rowH = 0;
    for (const zone of zones) {
        if (rowX > 0 && rowX + zone.w > ZONE_ROW_MAX_W) {
            rowY += rowH + ARRANGE_COMPONENT_GAP;
            rowX = 0;
            rowH = 0;
        }
        for (const [id, pos] of zone.local) {
            positions.set(id, { x: pos.x + rowX, y: pos.y + rowY });
        }
        rowX += zone.w + ARRANGE_COMPONENT_GAP;
        rowH = Math.max(rowH, zone.h);
    }

    const before = nodeBounds(nodes);
    let next = nodes.map((node) => {
        const pos = positions.get(node.id);
        return pos ? { ...node, position: pos } : node;
    });

    next = next.map((node) => {
        if (node.type !== CanvasNodeType.Group) return node;
        const children = next.filter((item) => item.metadata?.groupId === node.id && item.type !== CanvasNodeType.Group);
        if (!children.length) return node;
        const bounds = nodeBounds(children);
        return {
            ...node,
            position: { x: bounds.left - ARRANGE_GROUP_PAD, y: bounds.top - ARRANGE_GROUP_PAD },
            width: Math.max(node.width, bounds.right - bounds.left + ARRANGE_GROUP_PAD * 2),
            height: Math.max(120, bounds.bottom - bounds.top + ARRANGE_GROUP_PAD * 2),
        };
    });

    let emptyY = (nodeBounds(next.filter((node) => node.type !== CanvasNodeType.Group)).bottom || 0) + ARRANGE_COMPONENT_GAP;
    next = next.map((node) => {
        if (node.type !== CanvasNodeType.Group) return node;
        const hasChildren = next.some((item) => item.metadata?.groupId === node.id && item.type !== CanvasNodeType.Group);
        if (hasChildren) return node;
        const placed = { ...node, position: { x: 0, y: emptyY } };
        emptyY += node.height + ARRANGE_GAP_Y;
        return placed;
    });

    if (Number.isFinite(before.left) && Number.isFinite(before.right)) {
        const after = nodeBounds(next);
        const dx = (before.left + before.right) / 2 - (after.left + after.right) / 2;
        const dy = (before.top + before.bottom) / 2 - (after.top + after.bottom) / 2;
        if (dx || dy) {
            next = next.map((node) => ({ ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }));
        }
    }

    return next;
}

export function viewportToFitNodes(nodes: CanvasNodeData[], viewSize: { width: number; height: number }, padding = 96): ViewportTransform {
    if (!nodes.length || viewSize.width <= 0 || viewSize.height <= 0) {
        return { x: viewSize.width / 2, y: viewSize.height / 2, k: 1 };
    }
    const bounds = nodeBounds(nodes);
    const worldW = Math.max(1, bounds.right - bounds.left);
    const worldH = Math.max(1, bounds.bottom - bounds.top);
    const k = Math.min(Math.max(Math.min((viewSize.width - padding * 2) / worldW, (viewSize.height - padding * 2) / worldH), 0.05), 1);
    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    return {
        x: viewSize.width / 2 - cx * k,
        y: viewSize.height / 2 - cy * k,
        k,
    };
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (first.type === CanvasNodeType.Group || second.type === CanvasNodeType.Group) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}
