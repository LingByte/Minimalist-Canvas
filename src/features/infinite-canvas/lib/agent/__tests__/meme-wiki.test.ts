import { describe, expect, it } from "vitest";

import { formatMemeWikiEntry, matchMemeWikiEntry, type MemeWikiEntry } from "@canvas/lib/agent/meme-wiki";

const sample: MemeWikiEntry[] = [
    {
        title: "绝绝子",
        slug: "绝绝子",
        tags: "网络用语",
        usage: "用来夸到极致。",
        origin: "网络流行语",
        other: "",
        summary: "表示非常厉害",
        aliases: "",
    },
    {
        title: "康神开播了",
        slug: "kangshen",
        tags: "主播梗",
        usage: "调侃开播。",
        origin: "直播",
        other: "",
        summary: "主播相关",
        aliases: "kskbl,康神开播",
    },
    {
        title: "去码头整点薯条",
        slug: "fries",
        tags: "短视频梗",
        usage: "玩抽象。",
        origin: "短视频",
        other: "",
        summary: "抽象金句",
        aliases: "",
    },
];

describe("matchMemeWikiEntry", () => {
    it("matches exact title", () => {
        expect(matchMemeWikiEntry(sample, "绝绝子")?.title).toBe("绝绝子");
    });

    it("matches aliases", () => {
        expect(matchMemeWikiEntry(sample, "kskbl")?.title).toBe("康神开播了");
    });

    it("matches title contained in a longer query", () => {
        expect(matchMemeWikiEntry(sample, "去码头整点薯条是什么梗")?.title).toBe("去码头整点薯条");
    });

    it("matches partial title for longer queries", () => {
        expect(matchMemeWikiEntry(sample, "码头整")?.title).toBe("去码头整点薯条");
    });
});

describe("formatMemeWikiEntry", () => {
    it("includes usage guidance", () => {
        const text = formatMemeWikiEntry(sample[0]);
        expect(text).toContain("绝绝子");
        expect(text).toContain("怎么用");
    });
});
