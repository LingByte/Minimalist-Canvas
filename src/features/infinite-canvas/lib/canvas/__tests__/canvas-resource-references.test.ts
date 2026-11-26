import { describe, expect, it } from "vitest";

import {
    parsePromptReferencedNodeIds,
    pruneRemovedMentionConnections,
    resolveMentionConnectionTarget,
} from "../canvas-resource-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@canvas/types/canvas";

function node(partial: Partial<CanvasNodeData> & Pick<CanvasNodeData, "id" | "type">): CanvasNodeData {
    return {
        title: partial.title || partial.id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        metadata: partial.metadata || { content: "data:image/png;base64,xx" },
        ...partial,
    };
}

describe("parsePromptReferencedNodeIds", () => {
    it("returns unique node ids in prompt order", () => {
        expect(parsePromptReferencedNodeIds("A @[node:img-1] and @[node:vid-2] then @[node:img-1]")).toEqual(["img-1", "vid-2"]);
    });

    it("returns empty when there are no chips", () => {
        expect(parsePromptReferencedNodeIds("plain prompt")).toEqual([]);
    });
});

describe("pruneRemovedMentionConnections", () => {
    const image = node({ id: "img-1", type: CanvasNodeType.Image });
    const video = node({ id: "vid-1", type: CanvasNodeType.Video });
    const text = node({ id: "text-1", type: CanvasNodeType.Text, metadata: { content: "hello" } });
    const consumer = node({ id: "gen-1", type: CanvasNodeType.Image, metadata: { prompt: "" } });
    const nodes = [image, video, text, consumer];
    const connections: CanvasConnection[] = [
        { id: "c1", fromNodeId: "img-1", toNodeId: "gen-1" },
        { id: "c2", fromNodeId: "vid-1", toNodeId: "gen-1" },
        { id: "c3", fromNodeId: "text-1", toNodeId: "gen-1" },
    ];

    it("disconnects only resources whose @ chips were removed", () => {
        const next = pruneRemovedMentionConnections(
            "gen-1",
            "use @[node:img-1] and @[node:vid-1]",
            "use @[node:vid-1]",
            nodes,
            connections,
        );
        expect(next.map((item) => item.id)).toEqual(["c2", "c3"]);
    });

    it("keeps manual wires that were never mentioned", () => {
        const next = pruneRemovedMentionConnections("gen-1", "use @[node:img-1]", "plain text", nodes, connections);
        expect(next.map((item) => item.id)).toEqual(["c2", "c3"]);
    });

    it("does nothing when mention set is unchanged", () => {
        const next = pruneRemovedMentionConnections(
            "gen-1",
            "use @[node:img-1]",
            "please use @[node:img-1] now",
            nodes,
            connections,
        );
        expect(next).toBe(connections);
    });

    it("prunes edges on the linked Config target for image/video consumers", () => {
        const config = node({ id: "cfg-1", type: CanvasNodeType.Config, metadata: {} });
        const wired: CanvasConnection[] = [
            { id: "link", fromNodeId: "gen-1", toNodeId: "cfg-1" },
            { id: "ref", fromNodeId: "img-1", toNodeId: "cfg-1" },
        ];
        const next = pruneRemovedMentionConnections("gen-1", "@[node:img-1]", "", [...nodes, config], wired);
        expect(next.map((item) => item.id)).toEqual(["link"]);
        expect(resolveMentionConnectionTarget("gen-1", [...nodes, config], wired)).toBe("cfg-1");
    });
});
