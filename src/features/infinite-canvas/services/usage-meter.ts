import { nanoid } from "nanoid";

import { kvStore } from "@canvas/services/fs-store";

export const USAGE_EVENT_STORE = "api_usage_events";

const store = kvStore(USAGE_EVENT_STORE);
const MAX_EVENTS = 12_000;

export type UsageCapability = "text" | "image" | "video" | "audio";
export type UsageOrigin = "canvas" | "workbench" | "agent" | "optimize" | "config" | "other";
export type UsageStatus = "success" | "failed";
export type UsageUnitKind = "count" | "seconds" | "characters" | "bytes";

export type TokenUsage = {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    totalTokens?: number;
    /** True when tokens were estimated locally (provider omitted usage). */
    estimated?: boolean;
};

export type UsageEvent = {
    id: string;
    createdAt: number;
    capability: UsageCapability;
    model: string;
    origin?: UsageOrigin;
    status: UsageStatus;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    totalTokens?: number;
    tokensEstimated?: boolean;
    /** Media metering: image count, video seconds, TTS characters, etc. */
    units?: number;
    unitKind?: UsageUnitKind;
    error?: string;
};

export type UsageDateRange = "7d" | "30d" | "90d" | "all";

export type UsageDailyPoint = {
    day: string;
    textCalls: number;
    imageCalls: number;
    videoCalls: number;
    audioCalls: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    imageUnits: number;
    videoUnits: number;
    audioUnits: number;
};

export type UsageHeatmapCell = {
    weekday: number; // 0=Mon … 6=Sun
    hour: number;
    weight: number;
    calls: number;
    totalTokens: number;
};

export type UsageSummary = {
    range: UsageDateRange;
    fromMs: number | null;
    toMs: number;
    /** Where events are persisted (for UI copy). */
    storage: "filesystem" | "indexeddb";
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    tokenComposition: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        totalTokens: number;
    };
    byCapability: Record<
        UsageCapability,
        {
            calls: number;
            success: number;
            failed: number;
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens: number;
            cacheWriteTokens: number;
            totalTokens: number;
            units: number;
        }
    >;
    byOrigin: Array<{
        origin: UsageOrigin;
        calls: number;
        totalTokens: number;
    }>;
    byModel: Array<{
        model: string;
        capability: UsageCapability;
        calls: number;
        totalTokens: number;
        units: number;
        success: number;
        failed: number;
    }>;
    /** Continuous day series (empty days included for charts). */
    daily: UsageDailyPoint[];
    /** 7×24 activity matrix flattened; weight blends tokens + media units. */
    heatmap: UsageHeatmapCell[];
    hourly: Array<{ hour: number; weight: number; calls: number }>;
    recent: UsageEvent[];
};

type RecordUsageInput = Omit<UsageEvent, "id" | "createdAt"> & {
    id?: string;
    createdAt?: number;
};

function emptyCapabilityBucket() {
    return {
        calls: 0,
        success: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        units: 0,
    };
}

function dayKey(ms: number) {
    const date = new Date(ms);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function rangeStartMs(range: UsageDateRange, now = Date.now()) {
    if (range === "all") return null;
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    return now - days * 24 * 60 * 60 * 1000;
}

function normalizeTokens(tokens?: TokenUsage | null): Pick<
    UsageEvent,
    "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "totalTokens" | "tokensEstimated"
> {
    if (!tokens) return {};
    const inputTokens = positiveInt(tokens.inputTokens);
    const outputTokens = positiveInt(tokens.outputTokens);
    const cacheReadTokens = positiveInt(tokens.cacheReadTokens);
    const cacheWriteTokens = positiveInt(tokens.cacheWriteTokens);
    const explicitTotal = positiveInt(tokens.totalTokens);
    const summed =
        (inputTokens || 0) + (outputTokens || 0) + (cacheReadTokens || 0) + (cacheWriteTokens || 0);
    const totalTokens = explicitTotal || (summed > 0 ? summed : undefined);
    return {
        ...(inputTokens != null ? { inputTokens } : {}),
        ...(outputTokens != null ? { outputTokens } : {}),
        ...(cacheReadTokens != null ? { cacheReadTokens } : {}),
        ...(cacheWriteTokens != null ? { cacheWriteTokens } : {}),
        ...(totalTokens != null ? { totalTokens } : {}),
        ...(tokens.estimated ? { tokensEstimated: true } : {}),
    };
}

function positiveInt(value: unknown) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n);
}

/** Persist one API usage event. Safe to fire-and-forget. */
export async function recordUsage(input: RecordUsageInput): Promise<UsageEvent> {
    const event: UsageEvent = {
        id: input.id || nanoid(),
        createdAt: input.createdAt || Date.now(),
        capability: input.capability,
        model: (input.model || "").trim() || "unknown",
        origin: input.origin,
        status: input.status,
        durationMs: positiveInt(input.durationMs),
        ...normalizeTokens({
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            cacheReadTokens: input.cacheReadTokens,
            cacheWriteTokens: input.cacheWriteTokens,
            totalTokens: input.totalTokens,
            estimated: input.tokensEstimated,
        }),
        units: typeof input.units === "number" && Number.isFinite(input.units) ? input.units : undefined,
        unitKind: input.unitKind,
        error: input.error?.trim() || undefined,
    };
    await store.setItem(event.id, event);
    void pruneIfNeeded();
    return event;
}

/** Convenience wrapper that never throws into the generation path. */
export function trackUsage(input: RecordUsageInput) {
    void recordUsage(input).catch(() => {
        // Metering must not break generation.
    });
}

export function trackUsageWithTokens(
    input: Omit<RecordUsageInput, keyof ReturnType<typeof normalizeTokens>> & { tokens?: TokenUsage | null },
) {
    const tokens = normalizeTokens(input.tokens);
    trackUsage({ ...input, ...tokens });
}

let pruning = false;
async function pruneIfNeeded() {
    if (pruning) return;
    pruning = true;
    try {
        const length = await store.length();
        if (length <= MAX_EVENTS) return;
        const events = await listUsageEvents();
        const overflow = events.length - MAX_EVENTS;
        if (overflow <= 0) return;
        const doomed = events.slice(-overflow);
        await Promise.all(doomed.map((event) => store.removeItem(event.id)));
    } finally {
        pruning = false;
    }
}

export async function listUsageEvents(options?: { range?: UsageDateRange; limit?: number }): Promise<UsageEvent[]> {
    const from = rangeStartMs(options?.range || "all");
    const events: UsageEvent[] = [];
    await store.iterate<UsageEvent, void>((value) => {
        if (!value || typeof value !== "object") return;
        if (typeof value.createdAt !== "number" || !value.capability) return;
        if (from != null && value.createdAt < from) return;
        events.push(value);
    });
    events.sort((a, b) => b.createdAt - a.createdAt);
    if (options?.limit && options.limit > 0) return events.slice(0, options.limit);
    return events;
}

export async function clearUsageEvents() {
    await store.clear();
}

function emptyDailyPoint(day: string): UsageDailyPoint {
    return {
        day,
        textCalls: 0,
        imageCalls: 0,
        videoCalls: 0,
        audioCalls: 0,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        imageUnits: 0,
        videoUnits: 0,
        audioUnits: 0,
    };
}

function eventWeight(event: UsageEvent) {
    if (event.capability === "text") return Math.max(1, event.totalTokens || 0);
    if (event.capability === "image") return Math.max(1, (event.units || 1) * 8);
    if (event.capability === "video") return Math.max(1, (event.units || 1) * 4);
    return Math.max(1, Math.ceil((event.units || 1) / 20));
}

function fillDailySeries(fromMs: number | null, toMs: number, dailyMap: Map<string, UsageDailyPoint>) {
    const end = new Date(toMs);
    end.setHours(23, 59, 59, 999);
    let start = fromMs != null ? new Date(fromMs) : null;
    if (!start) {
        const keys = [...dailyMap.keys()].sort();
        if (!keys.length) return [] as UsageDailyPoint[];
        start = new Date(`${keys[0]}T00:00:00`);
    }
    start.setHours(0, 0, 0, 0);
    // Cap continuous fill so "all" with sparse history stays readable.
    const maxDays = 120;
    const spanDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > maxDays) {
        start = new Date(end);
        start.setDate(end.getDate() - (maxDays - 1));
        start.setHours(0, 0, 0, 0);
    }
    const points: UsageDailyPoint[] = [];
    for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
        const key = dayKey(cursor.getTime());
        points.push(dailyMap.get(key) || emptyDailyPoint(key));
    }
    return points;
}

export async function summarizeUsage(range: UsageDateRange = "30d"): Promise<UsageSummary> {
    const now = Date.now();
    const fromMs = rangeStartMs(range, now);
    const events = await listUsageEvents({ range });
    const byCapability: UsageSummary["byCapability"] = {
        text: emptyCapabilityBucket(),
        image: emptyCapabilityBucket(),
        video: emptyCapabilityBucket(),
        audio: emptyCapabilityBucket(),
    };
    const modelMap = new Map<string, UsageSummary["byModel"][number]>();
    const originMap = new Map<UsageOrigin, { origin: UsageOrigin; calls: number; totalTokens: number }>();
    const dailyMap = new Map<string, UsageDailyPoint>();
    const heatmapMatrix: Array<Array<{ weight: number; calls: number; totalTokens: number }>> = Array.from(
        { length: 7 },
        () => Array.from({ length: 24 }, () => ({ weight: 0, calls: 0, totalTokens: 0 })),
    );
    const tokenComposition = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
    };

    for (const event of events) {
        const bucket = byCapability[event.capability];
        bucket.calls += 1;
        if (event.status === "success") bucket.success += 1;
        else bucket.failed += 1;
        bucket.inputTokens += event.inputTokens || 0;
        bucket.outputTokens += event.outputTokens || 0;
        bucket.cacheReadTokens += event.cacheReadTokens || 0;
        bucket.cacheWriteTokens += event.cacheWriteTokens || 0;
        bucket.totalTokens += event.totalTokens || 0;
        bucket.units += event.units || 0;

        tokenComposition.inputTokens += event.inputTokens || 0;
        tokenComposition.outputTokens += event.outputTokens || 0;
        tokenComposition.cacheReadTokens += event.cacheReadTokens || 0;
        tokenComposition.cacheWriteTokens += event.cacheWriteTokens || 0;
        tokenComposition.totalTokens += event.totalTokens || 0;

        const modelKey = `${event.capability}::${event.model}`;
        const modelRow = modelMap.get(modelKey) || {
            model: event.model,
            capability: event.capability,
            calls: 0,
            totalTokens: 0,
            units: 0,
            success: 0,
            failed: 0,
        };
        modelRow.calls += 1;
        modelRow.totalTokens += event.totalTokens || 0;
        modelRow.units += event.units || 0;
        if (event.status === "success") modelRow.success += 1;
        else modelRow.failed += 1;
        modelMap.set(modelKey, modelRow);

        const origin = event.origin || "other";
        const originRow = originMap.get(origin) || { origin, calls: 0, totalTokens: 0 };
        originRow.calls += 1;
        originRow.totalTokens += event.totalTokens || 0;
        originMap.set(origin, originRow);

        const day = dayKey(event.createdAt);
        const daily = dailyMap.get(day) || emptyDailyPoint(day);
        daily.calls += 1;
        if (event.capability === "text") daily.textCalls += 1;
        if (event.capability === "image") {
            daily.imageCalls += 1;
            daily.imageUnits += event.units || 0;
        }
        if (event.capability === "video") {
            daily.videoCalls += 1;
            daily.videoUnits += event.units || 0;
        }
        if (event.capability === "audio") {
            daily.audioCalls += 1;
            daily.audioUnits += event.units || 0;
        }
        daily.inputTokens += event.inputTokens || 0;
        daily.outputTokens += event.outputTokens || 0;
        daily.cacheReadTokens += event.cacheReadTokens || 0;
        daily.cacheWriteTokens += event.cacheWriteTokens || 0;
        daily.totalTokens += event.totalTokens || 0;
        dailyMap.set(day, daily);

        const date = new Date(event.createdAt);
        const weekday = (date.getDay() + 6) % 7;
        const hour = date.getHours();
        const cell = heatmapMatrix[weekday][hour];
        cell.calls += 1;
        cell.totalTokens += event.totalTokens || 0;
        cell.weight += eventWeight(event);
    }

    const heatmap: UsageHeatmapCell[] = [];
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, weight: 0, calls: 0 }));
    for (let weekday = 0; weekday < 7; weekday += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            const cell = heatmapMatrix[weekday][hour];
            heatmap.push({ weekday, hour, ...cell });
            hourly[hour].weight += cell.weight;
            hourly[hour].calls += cell.calls;
        }
    }

    return {
        range,
        fromMs,
        toMs: now,
        storage: typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? "filesystem" : "indexeddb",
        totalCalls: events.length,
        successCalls: events.filter((item) => item.status === "success").length,
        failedCalls: events.filter((item) => item.status === "failed").length,
        tokenComposition,
        byCapability,
        byOrigin: [...originMap.values()].sort((a, b) => b.calls - a.calls),
        byModel: [...modelMap.values()].sort((a, b) => b.calls - a.calls || b.totalTokens - a.totalTokens),
        daily: fillDailySeries(fromMs, now, dailyMap),
        heatmap,
        hourly,
        recent: events.slice(0, 50),
    };
}

/** Rough local estimate when provider omits usage (chars≈tokens/4 for CJK-ish text). */
export function estimateTextTokens(promptChars: number, completionChars: number): TokenUsage {
    const inputTokens = Math.max(1, Math.ceil(Math.max(0, promptChars) / 2));
    const outputTokens = Math.max(0, Math.ceil(Math.max(0, completionChars) / 2));
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimated: true,
    };
}

export function parseProviderUsage(payload: unknown): TokenUsage | null {
    if (!payload || typeof payload !== "object") return null;
    const root = payload as Record<string, unknown>;
    const usage =
        (isRecord(root.usage) ? root.usage : null) ||
        (isRecord(root.token_usage) ? root.token_usage : null) ||
        (isRecord(root.usageMetadata) ? root.usageMetadata : null) ||
        (isRecord(root.usage_metadata) ? root.usage_metadata : null);
    if (!usage) return null;

    const inputTokens =
        positiveInt(usage.input_tokens) ??
        positiveInt(usage.prompt_tokens) ??
        positiveInt(usage.promptTokens) ??
        positiveInt(usage.inputTokens) ??
        positiveInt(usage.promptTokenCount);
    const outputTokens =
        positiveInt(usage.output_tokens) ??
        positiveInt(usage.completion_tokens) ??
        positiveInt(usage.completionTokens) ??
        positiveInt(usage.outputTokens) ??
        positiveInt(usage.candidatesTokenCount);
    const cacheReadTokens =
        positiveInt(usage.cache_read_input_tokens) ??
        positiveInt(usage.cache_read_tokens) ??
        positiveInt(usage.cached_tokens) ??
        positiveInt(usage.cached_input_tokens) ??
        positiveInt(usage.cacheReadTokens);
    const cacheWriteTokens =
        positiveInt(usage.cache_creation_input_tokens) ??
        positiveInt(usage.cache_write_tokens) ??
        positiveInt(usage.cacheWriteTokens);
    const totalTokens =
        positiveInt(usage.total_tokens) ??
        positiveInt(usage.totalTokens) ??
        positiveInt(usage.totalTokenCount);

    if (
        inputTokens == null &&
        outputTokens == null &&
        cacheReadTokens == null &&
        cacheWriteTokens == null &&
        totalTokens == null
    ) {
        return null;
    }
    return {
        inputTokens: inputTokens ?? undefined,
        outputTokens: outputTokens ?? undefined,
        cacheReadTokens: cacheReadTokens ?? undefined,
        cacheWriteTokens: cacheWriteTokens ?? undefined,
        totalTokens:
            totalTokens ??
            ((inputTokens || 0) + (outputTokens || 0) + (cacheReadTokens || 0) + (cacheWriteTokens || 0) || undefined),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
