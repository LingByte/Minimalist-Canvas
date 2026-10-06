/**
 * Fit media into a target box while preserving aspect ratio.
 * Always scales (up or down) so one edge fills maxWidth or maxHeight —
 * keeps dropped / uploaded image cards visually uniform on the canvas.
 */
export function fitNodeSize(width: number, height: number, maxWidth = 520, maxHeight = 360) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(maxWidth / w, maxHeight / h);
    return {
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
    };
}

export function nodeSizeToEdge(width: number, height: number, edge: number) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = edge / Math.max(w, h);
    return { width: w * scale, height: h * scale };
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    if (ratio < 0.25 || ratio > 4) return { width: baseWidth, height: baseHeight };
    return ratio >= baseWidth / baseHeight
        ? { width: baseWidth, height: Math.round(baseWidth / ratio) }
        : { width: Math.round(baseHeight * ratio), height: baseHeight };
}

/** Prefer measured pixels; if unknown, fall back to the selected aspect ratio (e.g. 16:9). */
export function imageNodeSizeFromUpload(
    width: number,
    height: number,
    sizeHint: string | undefined,
    maxWidth = 520,
    maxHeight = 360,
) {
    if (width > 0 && height > 0) {
        return fitNodeSize(width, height, maxWidth, maxHeight);
    }
    return nodeSizeFromRatio(sizeHint || "", maxWidth, maxHeight) || { width: maxWidth, height: maxHeight };
}

/**
 * Spread multiple dropped/imported files into a grid so they don't stack.
 * `origin` is the drop/center point; cells use the default fitted media box size.
 */
export function layoutMultiFilePositions(
    count: number,
    origin: { x: number; y: number },
    options?: { cellWidth?: number; cellHeight?: number; columns?: number; gap?: number },
) {
    if (count <= 0) return [];
    const gap = options?.gap ?? 40;
    const cellW = (options?.cellWidth ?? 520) + gap;
    const cellH = (options?.cellHeight ?? 360) + gap;
    const cols = Math.max(1, Math.min(options?.columns ?? Math.ceil(Math.sqrt(count)), count, 4));
    const rows = Math.ceil(count / cols);
    const gridW = (Math.min(count, cols) - 1) * cellW;
    const gridH = (rows - 1) * cellH;
    return Array.from({ length: count }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
            x: origin.x - gridW / 2 + col * cellW,
            y: origin.y - gridH / 2 + row * cellH,
        };
    });
}
