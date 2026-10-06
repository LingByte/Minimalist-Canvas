import { describe, expect, it } from "vitest";

import { createEmptyStoryboard, createStoryboardRow, normalizeStoryboard } from "./canvas-storyboard";

describe("canvas storyboard", () => {
    it("seeds three empty shots", () => {
        const storyboard = createEmptyStoryboard();
        expect(storyboard.rows).toHaveLength(3);
        expect(storyboard.rows.map((row) => row.shotNumber)).toEqual([1, 2, 3]);
        expect(storyboard.rows.every((row) => row.durationSeconds === 5 && row.plotDescription === "")).toBe(true);
    });

    it("fills missing storyboard data", () => {
        expect(normalizeStoryboard(undefined).rows).toHaveLength(3);
        const normalized = normalizeStoryboard({
            rows: [{ id: "", shotNumber: 0, durationSeconds: 0, plotDescription: "wide" }],
        });
        expect(normalized.rows).toHaveLength(1);
        expect(normalized.rows[0].shotNumber).toBe(1);
        expect(normalized.rows[0].durationSeconds).toBe(5);
        expect(normalized.rows[0].plotDescription).toBe("wide");
        expect(normalized.rows[0].id).toBeTruthy();
    });

    it("numbers a new shot", () => {
        expect(createStoryboardRow(4).shotNumber).toBe(4);
    });
});
