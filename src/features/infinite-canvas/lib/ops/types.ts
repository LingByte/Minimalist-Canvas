export type OpsPlatform = "douyin" | "kuaishou" | "xiaohongshu";

export type OpsAccountStatus = "active" | "expired" | "unknown";

export type OpsPublishStatus = "queued" | "running" | "success" | "failed";

export type OpsSyncStatus = "idle" | "running" | "success" | "failed";

export interface OpsAccount {
    id: string;
    platform: OpsPlatform;
    displayName: string;
    /** Absolute path to Playwright storage_state JSON. */
    statePath: string;
    status: OpsAccountStatus;
    createdAt: number;
    updatedAt: number;
    lastLoginAt?: number;
    lastSyncAt?: number;
    note?: string;
}

export interface OpsPublishJob {
    id: string;
    accountId: string;
    platform: OpsPlatform;
    title: string;
    tags: string[];
    /** Absolute local video path. */
    videoPath: string;
    /** Optional ISO datetime for scheduled publish. */
    publishAt?: string;
    status: OpsPublishStatus;
    createdAt: number;
    updatedAt: number;
    error?: string;
    remoteUrl?: string;
}

export interface OpsContentMetrics {
    contentId: string;
    title: string;
    publishedAt?: string;
    playCount?: number;
    completeRate?: number;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    collectCount?: number;
    homeVisitCount?: number;
    followerDelta?: number;
    avgPlayDurationSec?: number;
    clickCount?: number;
    bounce2sRate?: number;
    raw?: Record<string, unknown>;
}

export interface OpsMetricsSnapshot {
    id: string;
    accountId: string;
    platform: OpsPlatform;
    capturedAt: number;
    /** YYYY-MM-DD local date key for day-over-day diffs. */
    dayKey: string;
    items: OpsContentMetrics[];
}

export interface OpsStoreState {
    version: 1;
    accounts: OpsAccount[];
    publishJobs: OpsPublishJob[];
    snapshots: OpsMetricsSnapshot[];
}

export type OpsRunnerCommand = "login" | "publish" | "sync" | "check";

export interface OpsRunnerRequest {
    command: OpsRunnerCommand;
    platform: OpsPlatform;
    accountId: string;
    statePath: string;
    /** Chrome / Edge executable override. */
    chromePath?: string;
    videoPath?: string;
    title?: string;
    tags?: string[];
    publishAt?: string;
    /** Where sync writes a fresh snapshot JSON. */
    outPath?: string;
    headless?: boolean;
}

export interface OpsRunnerProgressEvent {
    type: "progress" | "done" | "error" | "qr";
    message?: string;
    result?: unknown;
    /** data:image/... QR for in-app scan (headless login). */
    qrDataUrl?: string;
}

export const OPS_PLATFORMS: OpsPlatform[] = ["douyin", "kuaishou", "xiaohongshu"];

export function emptyOpsStore(): OpsStoreState {
    return { version: 1, accounts: [], publishJobs: [], snapshots: [] };
}

export function dayKeyFromMs(ms: number = Date.now()) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
