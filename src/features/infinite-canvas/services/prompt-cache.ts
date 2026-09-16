import localforage from "localforage";

import type { Prompt, PromptListResponse } from "./api/prompts";
import { ALL_PROMPTS_OPTION } from "./api/prompts";

const PROMPT_REGISTRY_BASE = "https://canvas.lingecho.com";

const store = localforage.createInstance({
    name: "minimalist-canvas",
    storeName: "prompt-cache",
});

type CachedPrompts = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
    syncedAt: string;
};

const CACHE_KEY = "all-prompts";

export async function getCachedPrompts(): Promise<CachedPrompts | null> {
    return (await store.getItem<CachedPrompts>(CACHE_KEY)) || null;
}

export async function setCachedPrompts(data: Omit<CachedPrompts, "syncedAt">): Promise<void> {
    await store.setItem<CachedPrompts>(CACHE_KEY, { ...data, syncedAt: new Date().toISOString() });
}

export async function mergeCachedPrompts(newItems: Prompt[]): Promise<CachedPrompts> {
    const existing = await getCachedPrompts();
    const existingIds = new Set((existing?.items || []).map((item) => item.id));
    const merged = [...(existing?.items || [])];
    let added = 0;
    for (const item of newItems) {
        if (!existingIds.has(item.id)) {
            merged.push(item);
            existingIds.add(item.id);
            added++;
        }
    }
    const tags = [...new Set(merged.flatMap((item) => item.tags))];
    const categories = [...new Set(merged.map((item) => item.category).filter(Boolean))];
    const result: CachedPrompts = {
        items: merged,
        tags,
        categories,
        total: merged.length,
        syncedAt: new Date().toISOString(),
    };
    await store.setItem<CachedPrompts>(CACHE_KEY, result);
    return result;
}

export async function getSyncedAt(): Promise<string | null> {
    const cached = await getCachedPrompts();
    return cached?.syncedAt || null;
}

export async function filterCachedPrompts(params: {
    keyword?: string;
    tag?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
}): Promise<PromptListResponse> {
    const cached = await getCachedPrompts();
    if (!cached) return { items: [], tags: [], categories: [], total: 0 };

    let items = cached.items;
    const keyword = (params.keyword || "").trim().toLowerCase();
    if (keyword) {
        items = items.filter(
            (item) =>
                item.title.toLowerCase().includes(keyword) ||
                item.prompt.toLowerCase().includes(keyword) ||
                item.tags.some((tag) => tag.toLowerCase().includes(keyword))
        );
    }
    const tags = params.tag?.filter(Boolean) || [];
    if (tags.length) {
        items = items.filter((item) => tags.every((tag) => item.tags.includes(tag)));
    }
    const category = params.category || ALL_PROMPTS_OPTION;
    if (category && category !== ALL_PROMPTS_OPTION && category !== "all") {
        items = items.filter((item) => item.category === category);
    }

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return {
        items: paged,
        tags: cached.tags,
        categories: cached.categories,
        total: items.length,
    };
}

async function fetchAllRemotePrompts(): Promise<Prompt[]> {
    const items: Prompt[] = [];
    let page = 1;
    for (;;) {
        const params = new URLSearchParams();
        params.set("p", String(page));
        params.set("page_size", "100");
        const url = `${PROMPT_REGISTRY_BASE}/api/prompts/?${params.toString()}`;
        let body: any;
        try {
            const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
            const res = await tauriFetch(url);
            if (!res.ok) throw new Error(`Failed to fetch prompts: ${res.status}`);
            body = await res.json();
        } catch {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch prompts: ${res.status}`);
            body = await res.json();
        }
        if (!body?.success || !body.data) throw new Error(body?.message || "Failed to load prompts");
        const pageItems: Prompt[] = (body.data.items || []).map((item: Prompt) => ({
            ...item,
            description: item.description || "",
            referenceImageUrls: Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : [],
            tags: Array.isArray(item.tags) ? item.tags : [],
            preview: item.preview || "",
            createdAt: item.createdAt || "",
            updatedAt: item.updatedAt || "",
            coverUrl: item.coverUrl || "",
            githubUrl: item.githubUrl || "",
            category: item.category || "",
            sourceId: item.sourceId || "",
        }));
        items.push(...pageItems);
        if (pageItems.length < 100) break;
        page++;
        if (page > 50) break;
    }
    return items;
}

export async function syncPromptsFromRemote(): Promise<{ added: number; total: number }> {
    const remoteItems = await fetchAllRemotePrompts();
    const existing = await getCachedPrompts();
    const existingIds = new Set((existing?.items || []).map((item) => item.id));
    const added = remoteItems.filter((item) => !existingIds.has(item.id)).length;
    const merged = await mergeCachedPrompts(remoteItems);
    return { added, total: merged.total };
}

export async function ensurePromptsCached(): Promise<CachedPrompts | null> {
    const cached = await getCachedPrompts();
    if (cached && cached.items.length > 0) return cached;
    await syncPromptsFromRemote();
    return getCachedPrompts();
}
