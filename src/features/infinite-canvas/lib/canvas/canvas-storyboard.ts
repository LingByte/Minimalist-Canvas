import { nanoid } from "nanoid";

import type { StoryboardData, StoryboardRow } from "@canvas/types/canvas";

export function createEmptyStoryboard(rowCount = 3): StoryboardData {
    return {
        rows: Array.from({ length: rowCount }, (_, index) => createStoryboardRow(index + 1)),
    };
}

export function createStoryboardRow(shotNumber: number): StoryboardRow {
    return {
        id: nanoid(),
        shotNumber,
        durationSeconds: 5,
        plotDescription: "",
    };
}

export function normalizeStoryboard(data?: StoryboardData | null): StoryboardData {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    if (rows.length) {
        return {
            rows: rows.map((row, index) => ({
                id: row.id || nanoid(),
                shotNumber: row.shotNumber || index + 1,
                durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : 5,
                plotDescription: row.plotDescription || "",
                imageNodeId: row.imageNodeId,
                videoNodeId: row.videoNodeId,
            })),
        };
    }
    return createEmptyStoryboard();
}
