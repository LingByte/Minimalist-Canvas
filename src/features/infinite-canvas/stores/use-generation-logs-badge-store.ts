import { create } from "zustand";

import { listGenerationAssets, type GenerationAsset } from "@canvas/services/api/generation-assets";

const SEEN_AT_KEY = "canvas-generation-logs-seen-at";
const POLL_MS = 12_000;

function readSeenAt() {
    if (typeof window === "undefined") return 0;
    const raw = localStorage.getItem(SEEN_AT_KEY);
    if (raw == null) return -1;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : -1;
}

function writeSeenAt(value: number) {
    if (typeof window === "undefined") return;
    localStorage.setItem(SEEN_AT_KEY, String(value));
}

function assetTimeMs(asset: GenerationAsset) {
    const raw = asset.updated_at || asset.created_at || 0;
    return raw > 1e12 ? raw : raw * 1000;
}

function latestAssetTime(items: GenerationAsset[]) {
    return items.reduce((max, item) => Math.max(max, assetTimeMs(item)), 0);
}

function computeBadge(items: GenerationAsset[], seenAt: number) {
    const pendingCount = items.filter((item) => item.status === "pending").length;
    // First visit (-1): don't treat historical rows as unread; still show pending.
    const unreadCount = seenAt < 0 ? 0 : items.filter((item) => assetTimeMs(item) > seenAt).length;
    return { pendingCount, unreadCount };
}

type GenerationLogsBadgeStore = {
    items: GenerationAsset[];
    loading: boolean;
    loadingMore: boolean;
    nextCursor: string;
    hasMore: boolean;
    seenAt: number;
    pendingCount: number;
    unreadCount: number;
    watching: boolean;
    refresh: () => Promise<void>;
    loadMore: () => Promise<void>;
    markSeen: () => void;
    startWatching: () => void;
    stopWatching: () => void;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let watchers = 0;

function mergeAssets(current: GenerationAsset[], incoming: GenerationAsset[]) {
    const seen = new Set(current.map((item) => item.id));
    return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export const useGenerationLogsBadgeStore = create<GenerationLogsBadgeStore>((set, get) => ({
    items: [],
    loading: false,
    loadingMore: false,
    nextCursor: "",
    hasMore: false,
    seenAt: readSeenAt(),
    pendingCount: 0,
    unreadCount: 0,
    watching: false,
    refresh: async () => {
        set({ loading: true });
        try {
            const remote = await listGenerationAssets({ limit: 10 });
            const items = remote.items || [];
            let seenAt = get().seenAt;
            // Baseline on first visit so existing history doesn't flood the badge.
            if (seenAt < 0) {
                seenAt = Math.max(Date.now(), latestAssetTime(items));
                writeSeenAt(seenAt);
            }
            const badge = computeBadge(items, seenAt);
            set({
                items,
                nextCursor: remote.next_cursor || "",
                hasMore: Boolean(remote.has_more),
                seenAt,
                ...badge,
                loading: false,
            });
        } catch {
            set({ loading: false });
        }
    },
    loadMore: async () => {
        const { hasMore, nextCursor, loading, loadingMore } = get();
        if (!hasMore || !nextCursor || loading || loadingMore) return;
        set({ loadingMore: true });
        try {
            const remote = await listGenerationAssets({ cursor: nextCursor, limit: 10 });
            const items = mergeAssets(get().items, remote.items || []);
            const seenAt = get().seenAt;
            const badge = computeBadge(items, seenAt);
            set({
                items,
                nextCursor: remote.next_cursor || "",
                hasMore: Boolean(remote.has_more),
                ...badge,
                loadingMore: false,
            });
        } catch {
            set({ loadingMore: false });
        }
    },
    markSeen: () => {
        const latest = Math.max(Date.now(), latestAssetTime(get().items));
        writeSeenAt(latest);
        const badge = computeBadge(get().items, latest);
        set({ seenAt: latest, ...badge });
    },
    startWatching: () => {
        watchers += 1;
        if (watchers > 1) return;
        set({ watching: true });
        void get().refresh();
        pollTimer = setInterval(() => {
            void get().refresh();
        }, POLL_MS);
    },
    stopWatching: () => {
        watchers = Math.max(0, watchers - 1);
        if (watchers > 0) return;
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        set({ watching: false });
    },
}));
