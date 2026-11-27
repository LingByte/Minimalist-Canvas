import { describe, expect, it } from "vitest";

import { BUILTIN_AGENT_MAX_TOOL_ROUNDS } from "@canvas/lib/agent/builtin-agent-harness";
import { buildBuiltinAgentSystemPrompt, compactCanvasSnapshot } from "@canvas/lib/agent/builtin-agent-context";
import { applyCanvasAgentOps, type CanvasAgentSnapshot } from "@canvas/lib/canvas/canvas-agent-ops";
import { CanvasNodeType } from "@canvas/types/canvas";

function emptySnapshot(): CanvasAgentSnapshot {
    return {
        projectId: "p1",
        title: "test",
        nodes: [],
        connections: [],
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, zoom: 1 },
    };
}

describe("script harness ops", () => {
    it("auto-initializes storyboard when adding a script node", () => {
        const next = applyCanvasAgentOps(emptySnapshot(), [
            { type: "add_node", id: "script-1", nodeType: CanvasNodeType.Script, title: "分镜" },
        ]);
        const node = next.nodes[0];
        expect(node?.type).toBe(CanvasNodeType.Script);
        expect(node?.metadata?.workflowKind).toBe("storyboard");
        expect(node?.metadata?.storyboard?.rows?.length).toBeGreaterThan(0);
    });

    it("keeps agent-provided storyboard rows and normalizes them", () => {
        const next = applyCanvasAgentOps(emptySnapshot(), [
            {
                type: "add_node",
                id: "script-2",
                nodeType: CanvasNodeType.Script,
                metadata: {
                    storyboard: {
                        rows: [
                            { id: "", shotNumber: 1, durationSeconds: 0, plotDescription: "开场" },
                            { id: "row-2", shotNumber: 2, durationSeconds: 4, plotDescription: "反转" },
                        ],
                    },
                },
            },
        ]);
        const rows = next.nodes[0]?.metadata?.storyboard?.rows || [];
        expect(rows).toHaveLength(2);
        expect(rows[0].id).toBeTruthy();
        expect(rows[0].durationSeconds).toBe(5);
        expect(rows[1].plotDescription).toBe("反转");
    });

    it("replaces an existing node when add_node reuses the same id", () => {
        const first = applyCanvasAgentOps(emptySnapshot(), [
            { type: "add_node", id: "script-dup", nodeType: CanvasNodeType.Script, title: "旧" },
        ]);
        const next = applyCanvasAgentOps(first, [
            {
                type: "add_node",
                id: "script-dup",
                nodeType: CanvasNodeType.Script,
                title: "新",
                metadata: { storyboard: { rows: [{ id: "r1", shotNumber: 1, durationSeconds: 4, plotDescription: "重写" }] } },
            },
        ]);
        expect(next.nodes).toHaveLength(1);
        expect(next.nodes[0]?.title).toBe("新");
        expect(next.nodes[0]?.metadata?.storyboard?.rows?.[0]?.plotDescription).toBe("重写");
    });
});

describe("script harness prompt/snapshot", () => {
    it("raises tool round budget for multi-step storyboards", () => {
        expect(BUILTIN_AGENT_MAX_TOOL_ROUNDS).toBe(12);
    });

    it("teaches Script-node workflow in the system prompt", () => {
        const prompt = buildBuiltinAgentSystemPrompt(emptySnapshot());
        expect(prompt).toContain("script");
        expect(prompt.toLowerCase()).toContain("storyboard");
        expect(prompt).toContain("至简未来AI");
    });

    it("compacts storyboard rows into the snapshot summary", () => {
        const snapshot = applyCanvasAgentOps(emptySnapshot(), [
            {
                type: "add_node",
                id: "script-3",
                nodeType: CanvasNodeType.Script,
                metadata: {
                    storyboard: {
                        rows: [{ id: "r1", shotNumber: 1, durationSeconds: 5, plotDescription: "主角推门进入教室" }],
                    },
                },
            },
        ]);
        const compact = compactCanvasSnapshot(snapshot);
        expect(compact.available).toBe(true);
        if (!compact.available) return;
        const script = compact.nodes.find((node) => node.type === CanvasNodeType.Script) as {
            storyboard?: { rows?: Array<{ plot?: string; shot?: number }> };
        };
        expect(script?.storyboard?.rows?.[0]?.shot).toBe(1);
        expect(script?.storyboard?.rows?.[0]?.plot).toContain("主角推门");
    });
});
