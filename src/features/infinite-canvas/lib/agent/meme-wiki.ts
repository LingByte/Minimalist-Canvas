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

type MemeWikiFile = {
    source?: string;
    builtAt?: string;
    count?: number;
    items: MemeWikiEntry[];
};

let entriesPromise: Promise<MemeWikiEntry[]> | null = null;
let entriesCache: MemeWikiEntry[] | null = null;

function memeWikiUrl() {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    return `${base}meme-wiki.json`;
}

async function loadMemeWikiEntries(): Promise<MemeWikiEntry[]> {
    if (entriesCache) return entriesCache;
    if (!entriesPromise) {
        entriesPromise = (async () => {
            const response = await fetch(memeWikiUrl());
            if (!response.ok) throw new Error(`meme wiki load failed: ${response.status}`);
            const payload = (await response.json()) as MemeWikiFile | MemeWikiEntry[];
            const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
            entriesCache = items.map((item) => ({
                title: String(item.title || "").trim(),
                slug: String(item.slug || "").trim(),
                tags: String(item.tags || ""),
                usage: String(item.usage || ""),
                origin: String(item.origin || ""),
                other: String(item.other || ""),
                summary: String(item.summary || ""),
                aliases: String(item.aliases || ""),
            })).filter((item) => item.title);
            return entriesCache;
        })().catch((error) => {
            entriesPromise = null;
            throw error;
        });
    }
    return entriesPromise;
}

function aliasHit(aliases: string, query: string) {
    if (!aliases) return false;
    const needle = query.toLowerCase();
    return aliases
        .split(/[,，]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .includes(needle);
}

function truncate(value: string, max: number) {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
}

/** Match one meme entry. Priority mirrors dsh-memewiki: exact → alias → prefix → query contains title → title contains query. */
export function matchMemeWikiEntry(entries: MemeWikiEntry[], query: string): MemeWikiEntry | null {
    const q = String(query || "").trim();
    if (!q) return null;
    const lower = q.toLowerCase();

    const exact = entries.find((item) => item.title === q || item.slug === q);
    if (exact) return exact;

    const byAlias = entries.find((item) => aliasHit(item.aliases, q));
    if (byAlias) return byAlias;

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

const MemeWikiGuidance =
    "[梗百科·用法]\n" +
    "1. 查到词条就先接梗，别急着科普；照「怎么用/怎么接」回一句。\n" +
    "2. 只有用户明确问「这是什么梗」时才解释出处，一两句即可。\n" +
    "3. 查不到就说不知道，别硬编。";

export async function searchMemeWiki(query: string): Promise<{
    ok: boolean;
    query: string;
    found: boolean;
    entry?: MemeWikiEntry;
    text: string;
}> {
    const q = String(query || "").trim();
    if (!q) {
        return { ok: false, query: q, found: false, text: "要查什么？请提供一个梗名、缩写或黑话。" };
    }
    const entries = await loadMemeWikiEntries();
    const entry = matchMemeWikiEntry(entries, q);
    if (!entry) {
        return {
            ok: true,
            query: q,
            found: false,
            text: `词库里没收录「${q}」。别硬解释——说不知道，或反问一句「这什么梗」。`,
        };
    }
    return {
        ok: true,
        query: q,
        found: true,
        entry,
        text: `${MemeWikiGuidance}\n\n${formatMemeWikiEntry(entry)}`,
    };
}
