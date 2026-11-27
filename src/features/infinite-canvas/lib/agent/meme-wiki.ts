export type MemeWikiEntry = {
    title: string;
    slug: string;
    tags: string;
    usage: string;
    origin: string;
    other: string;
    summary: string;
    aliases: string;
};

export type MemeWikiMode = "lookup" | "search" | "pack";

export type SearchMemeWikiInput = {
    query: string;
    mode?: MemeWikiMode | string;
    limit?: number;
    tags?: string;
};

type MemeWikiFile = {
    source?: string;
    builtAt?: string;
    count?: number;
    items: Array<Partial<MemeWikiEntry> & { title?: string; slug?: string }>;
};

type MemeWikiIndex = {
    entries: MemeWikiEntry[];
    byTitle: Map<string, MemeWikiEntry>;
    bySlug: Map<string, MemeWikiEntry>;
    byAlias: Map<string, MemeWikiEntry>;
};

export type MemeWikiHit = {
    title: string;
    slug: string;
    tags: string;
    aliases: string;
    usage: string;
    summary: string;
    score: number;
};

let indexPromise: Promise<MemeWikiIndex> | null = null;
let indexCache: MemeWikiIndex | null = null;

const DEFAULT_SEARCH_LIMIT = 6;
const DEFAULT_PACK_LIMIT = 6;
const MAX_LIMIT = 12;

/** Bundled static asset for the search_meme_wiki tool — not a temp preview dump. */
function memeWikiUrl() {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    return `${base}agent/meme-wiki.json`;
}

function normalizeEntry(item: Partial<MemeWikiEntry> & { title?: string; slug?: string }): MemeWikiEntry | null {
    const title = String(item.title || "").trim();
    if (!title) return null;
    return {
        title,
        slug: String(item.slug || "").trim(),
        tags: String(item.tags || ""),
        usage: String(item.usage || ""),
        origin: String(item.origin || ""),
        other: String(item.other || ""),
        summary: String(item.summary || ""),
        aliases: String(item.aliases || ""),
    };
}

function buildIndex(entries: MemeWikiEntry[]): MemeWikiIndex {
    const byTitle = new Map<string, MemeWikiEntry>();
    const bySlug = new Map<string, MemeWikiEntry>();
    const byAlias = new Map<string, MemeWikiEntry>();
    for (const entry of entries) {
        byTitle.set(entry.title.toLowerCase(), entry);
        if (entry.slug) bySlug.set(entry.slug.toLowerCase(), entry);
        if (!entry.aliases) continue;
        for (const alias of entry.aliases.split(/[,，]/)) {
            const key = alias.trim().toLowerCase();
            if (key && !byAlias.has(key)) byAlias.set(key, entry);
        }
    }
    return { entries, byTitle, bySlug, byAlias };
}

async function loadMemeWikiIndex(): Promise<MemeWikiIndex> {
    if (indexCache) return indexCache;
    if (!indexPromise) {
        indexPromise = (async () => {
            const response = await fetch(memeWikiUrl());
            if (!response.ok) throw new Error(`meme wiki load failed: ${response.status}`);
            const payload = (await response.json()) as MemeWikiFile | MemeWikiEntry[];
            const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
            const entries = items.map(normalizeEntry).filter((item): item is MemeWikiEntry => Boolean(item));
            indexCache = buildIndex(entries);
            return indexCache;
        })().catch((error) => {
            indexPromise = null;
            throw error;
        });
    }
    return indexPromise;
}

function truncate(value: string, max: number) {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

function clampLimit(value: unknown, fallback: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(MAX_LIMIT, Math.round(n)));
}

function normalizeMode(value: unknown): MemeWikiMode {
    const mode = String(value || "lookup").trim().toLowerCase();
    if (mode === "search" || mode === "pack") return mode;
    return "lookup";
}

function splitTags(value: string) {
    return value
        .split(/[,，、|/]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
}

function entryTags(entry: MemeWikiEntry) {
    return splitTags(entry.tags);
}

function toHit(entry: MemeWikiEntry, score: number): MemeWikiHit {
    return {
        title: entry.title,
        slug: entry.slug,
        tags: entry.tags,
        aliases: entry.aliases,
        usage: truncate(entry.usage || entry.summary || entry.origin, 180),
        summary: truncate(entry.summary || entry.origin, 140),
        score,
    };
}

/** Match one meme entry. Priority: exact title/slug → alias → prefix → query contains title → title contains query. */
export function matchMemeWikiEntry(entries: MemeWikiEntry[], query: string, index?: Pick<MemeWikiIndex, "byTitle" | "bySlug" | "byAlias">): MemeWikiEntry | null {
    const q = String(query || "").trim();
    if (!q) return null;
    const lower = q.toLowerCase();

    if (index) {
        const exact = index.byTitle.get(lower) || index.bySlug.get(lower) || index.byAlias.get(lower);
        if (exact) return exact;
    } else {
        const exact = entries.find((item) => item.title === q || item.slug === q);
        if (exact) return exact;
        const byAlias = entries.find((item) =>
            item.aliases
                .split(/[,，]/)
                .map((part) => part.trim().toLowerCase())
                .filter(Boolean)
                .includes(lower),
        );
        if (byAlias) return byAlias;
    }

    const prefixes = entries
        .filter((item) => item.title.toLowerCase().startsWith(lower))
        .sort((a, b) => a.title.length - b.title.length);
    if (prefixes[0]) return prefixes[0];

    const contained = entries
        .filter((item) => item.title.length >= 2 && lower.includes(item.title.toLowerCase()))
        .sort((a, b) => b.title.length - a.title.length);
    if (contained[0]) return contained[0];

    const shortAscii = q.length >= 2 && /^[0-9a-z]+$/i.test(q);
    if (q.length >= 3 || shortAscii) {
        const partial = entries
            .filter((item) => item.title.toLowerCase().includes(lower))
            .sort((a, b) => a.title.length - b.title.length);
        if (partial[0]) return partial[0];
    }

    return null;
}

/** Score an entry for multi-result search (title/alias/tags/summary/usage). */
export function scoreMemeWikiEntry(entry: MemeWikiEntry, query: string): number {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return 0;
    const title = entry.title.toLowerCase();
    const slug = entry.slug.toLowerCase();
    const aliases = entry.aliases.toLowerCase();
    const tags = entry.tags.toLowerCase();
    const haystack = `${entry.summary} ${entry.usage} ${entry.origin}`.toLowerCase();
    let score = 0;

    if (title === q || slug === q) score += 100;
    else if (title.startsWith(q) || slug.startsWith(q)) score += 70;
    else if (title.includes(q) || slug.includes(q)) score += 48;

    if (aliases) {
        const parts = aliases.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
        if (parts.includes(q)) score += 90;
        else if (parts.some((part) => part.startsWith(q))) score += 55;
        else if (parts.some((part) => part.includes(q) || q.includes(part))) score += 30;
    }

    if (tags.includes(q)) score += 36;
    else if (entryTags(entry).some((tag) => tag.includes(q) || q.includes(tag))) score += 28;

    if (haystack.includes(q)) score += 12;
    if (q.length >= 2 && title.length >= 2 && q.includes(title)) score += 40;

    return score;
}

/** Ranked multi-hit search for storyboard packing / brainstorming. */
export function searchMemeWikiEntries(entries: MemeWikiEntry[], query: string, limit = DEFAULT_SEARCH_LIMIT): MemeWikiHit[] {
    const q = String(query || "").trim();
    if (!q) return [];
    const capped = clampLimit(limit, DEFAULT_SEARCH_LIMIT);
    return entries
        .map((entry) => ({ entry, score: scoreMemeWikiEntry(entry, q) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length)
        .slice(0, capped)
        .map((item) => toHit(item.entry, item.score));
}

/**
 * Theme pack: prefer tag matches for campus/workplace/abstract/short-video vibes,
 * then fall back to ranked search on the same query.
 */
export function packMemeWikiEntries(
    entries: MemeWikiEntry[],
    theme: string,
    limit = DEFAULT_PACK_LIMIT,
    extraTags = "",
): MemeWikiHit[] {
    const q = String(theme || "").trim();
    const capped = clampLimit(limit, DEFAULT_PACK_LIMIT);
    const wanted = [...splitTags(q), ...splitTags(extraTags)];
    if (!q && !wanted.length) return [];

    const scored = entries
        .map((entry) => {
            const tags = entryTags(entry);
            let score = scoreMemeWikiEntry(entry, q);
            for (const tag of wanted) {
                if (tags.some((item) => item === tag || item.includes(tag) || tag.includes(item))) score += 42;
            }
            // Light boost for common Chinese meme-pack themes even when tags use longer phrases.
            if (/校园|学生|上课/.test(q) && /校园|学生|青春|上课/.test(entry.tags)) score += 18;
            if (/职场|上班|办公室/.test(q) && /职场|上班|办公|领导/.test(entry.tags)) score += 18;
            if (/抽象|发疯|无厘头/.test(q) && /抽象|发疯|无厘头|沙雕/.test(`${entry.tags}${entry.summary}${entry.usage}`)) score += 18;
            if (/短视频|抖音|二创/.test(q) && /短视频|抖音|二创|视频梗/.test(entry.tags)) score += 18;
            return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length);

    // Prefer unique titles; don't collapse distinct memes that only share a short prefix.
    const picked: MemeWikiHit[] = [];
    const seenTitles = new Set<string>();
    for (const item of scored) {
        const key = item.entry.title.toLowerCase();
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        picked.push(toHit(item.entry, item.score));
        if (picked.length >= capped) break;
    }
    return picked;
}

export function formatMemeWikiEntry(entry: MemeWikiEntry): string {
    const lines = [`[梗百科]「${entry.title}」`];
    if (entry.aliases.trim()) lines.push(`别名：${truncate(entry.aliases, 120)}`);
    if (entry.tags.trim()) lines.push(`标签：${truncate(entry.tags, 160)}`);
    if (entry.usage.trim()) lines.push(`怎么用 / 怎么接：\n${truncate(entry.usage, 900)}`);
    const meaning = entry.summary.trim() || entry.origin.trim();
    if (meaning) lines.push(`出处与含义：\n${truncate(meaning, 700)}`);
    if (entry.origin.trim() && entry.summary.trim() && entry.origin.trim() !== entry.summary.trim()) {
        lines.push(`来源补充：\n${truncate(entry.origin, 500)}`);
    }
    return lines.join("\n");
}

function formatMemeWikiHits(hits: MemeWikiHit[], heading: string) {
    if (!hits.length) return "";
    const lines = [`[梗百科·${heading}] 共 ${hits.length} 条（精简卡，写进分镜时先接梗别科普）`];
    hits.forEach((hit, index) => {
        lines.push(`${index + 1}. 「${hit.title}」${hit.tags ? ` · ${truncate(hit.tags, 40)}` : ""}`);
        if (hit.usage) lines.push(`   怎么用：${hit.usage}`);
        else if (hit.summary) lines.push(`   含义：${hit.summary}`);
    });
    lines.push("", "写分镜时：每镜最多绑定 1 个主梗，把接梗方式写进 plotDescription（对白/动作/镜头），不要堆百科解释。");
    return lines.join("\n");
}

const MemeWikiGuidance =
    "[梗百科·用法]\n" +
    "1. 查到词条就先接梗，别急着科普；照「怎么用/怎么接」回一句。\n" +
    "2. 只有用户明确问「这是什么梗」时才解释出处，一两句即可。\n" +
    "3. 查不到就说不知道，别硬编。\n" +
    "4. 写梗短剧时用 mode=search/pack 取素材包，再落到 Script 分镜。";

export async function searchMemeWiki(input: string | SearchMemeWikiInput): Promise<{
    ok: boolean;
    query: string;
    mode: MemeWikiMode;
    found: boolean;
    entry?: MemeWikiEntry;
    hits?: MemeWikiHit[];
    text: string;
}> {
    const options: SearchMemeWikiInput = typeof input === "string" ? { query: input } : input || { query: "" };
    const q = String(options.query || "").trim();
    const mode = normalizeMode(options.mode);
    if (!q) {
        return {
            ok: true,
            query: q,
            mode,
            found: false,
            text: mode === "pack" ? "要组什么题材的梗包？例如：校园、职场、抽象、短视频。" : "要查什么？请提供梗名、缩写、黑话，或题材关键词。",
        };
    }

    const index = await loadMemeWikiIndex();

    if (mode === "search") {
        const hits = searchMemeWikiEntries(index.entries, q, options.limit ?? DEFAULT_SEARCH_LIMIT);
        return {
            ok: true,
            query: q,
            mode,
            found: hits.length > 0,
            hits,
            text: hits.length
                ? formatMemeWikiHits(hits, "搜索")
                : `没有搜到跟「${q}」接近的梗。换个关键词，或改用 mode=pack 按题材组包。`,
        };
    }

    if (mode === "pack") {
        const hits = packMemeWikiEntries(index.entries, q, options.limit ?? DEFAULT_PACK_LIMIT, options.tags);
        return {
            ok: true,
            query: q,
            mode,
            found: hits.length > 0,
            hits,
            text: hits.length
                ? formatMemeWikiHits(hits, `题材包·${q}`)
                : `没有组成「${q}」题材包。试试：校园 / 职场 / 抽象 / 短视频，或先 mode=search。`,
        };
    }

    const entry = matchMemeWikiEntry(index.entries, q, index);
    if (!entry) {
        const suggestions = searchMemeWikiEntries(index.entries, q, 4);
        return {
            ok: true,
            query: q,
            mode,
            found: false,
            hits: suggestions,
            text: suggestions.length
                ? `词库里没有精确命中「${q}」。相近候选：\n${formatMemeWikiHits(suggestions, "候选")}`
                : `词库里没收录「${q}」。别硬解释——说不知道，或反问一句「这什么梗」。`,
        };
    }
    return {
        ok: true,
        query: q,
        mode,
        found: true,
        entry,
        text: `${MemeWikiGuidance}\n\n${formatMemeWikiEntry(entry)}`,
    };
}
