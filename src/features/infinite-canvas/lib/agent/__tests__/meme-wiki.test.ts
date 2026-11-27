import { describe, expect, it } from "vitest";

import {
    formatMemeWikiEntry,
    matchMemeWikiEntry,
    packMemeWikiEntries,
    scoreMemeWikiEntry,
    searchMemeWikiEntries,
    type MemeWikiEntry,
} from "@canvas/lib/agent/meme-wiki";

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
        tags: "短视频梗、抽象",
        usage: "玩抽象。",
        origin: "短视频",
        other: "",
        summary: "抽象金句",
        aliases: "",
    },
    {
        title: "社死现场",
        slug: "she-si",
        tags: "校园、社交",
        usage: "描述尴尬瞬间。",
        origin: "网络",
        other: "",
        summary: "公开场合很尴尬",
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

describe("searchMemeWikiEntries", () => {
    it("returns ranked multi hits", () => {
        const hits = searchMemeWikiEntries(sample, "抽象", 5);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some((hit) => hit.title === "去码头整点薯条")).toBe(true);
        expect(hits[0].score).toBeGreaterThan(0);
    });

    it("scores exact titles higher than weak contains", () => {
        expect(scoreMemeWikiEntry(sample[0], "绝绝子")).toBeGreaterThan(scoreMemeWikiEntry(sample[2], "绝绝子"));
    });
});

describe("packMemeWikiEntries", () => {
    it("packs campus-themed memes", () => {
        const hits = packMemeWikiEntries(sample, "校园", 4);
        expect(hits.some((hit) => hit.title === "社死现场")).toBe(true);
    });

    it("packs short-video / abstract themes", () => {
        const hits = packMemeWikiEntries(sample, "短视频", 4);
        expect(hits.some((hit) => hit.title === "去码头整点薯条")).toBe(true);
    });
});

describe("formatMemeWikiEntry", () => {
    it("includes usage guidance", () => {
        const text = formatMemeWikiEntry(sample[0]);
        expect(text).toContain("绝绝子");
        expect(text).toContain("怎么用");
    });
});
