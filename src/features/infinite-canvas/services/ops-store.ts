import { nanoid } from "nanoid";

import {
    dayKeyFromMs,
    emptyOpsStore,
    type OpsAccount,
    type OpsContentMetrics,
    type OpsMetricsSnapshot,
    type OpsPlatform,
    type OpsPublishJob,
    type OpsStoreState,
} from "@canvas/lib/ops/types";
import { isTauri, storageRoot } from "@canvas/services/fs-store";

const STORE_FILE = "store.json";

async function joinPath(...parts: string[]) {
    const { join } = await import("@tauri-apps/api/path");
    return join(...parts);
}

export async function opsRootDir() {
    if (!isTauri()) return "";
    return joinPath(await storageRoot(), "ops");
}

async function ensureOpsDirs() {
    if (!isTauri()) throw new Error("OPS_DESKTOP_ONLY");
    const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
    const root = await opsRootDir();
    const accounts = await joinPath(root, "accounts");
    const snapshots = await joinPath(root, "snapshots");
    const jobs = await joinPath(root, "jobs");
    for (const dir of [root, accounts, snapshots, jobs]) {
        if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    }
    return { root, accounts, snapshots, jobs };
}

function storePath(root: string) {
    return `${root.replace(/\/+$/, "")}/${STORE_FILE}`;
}

export async function loadOpsStore(): Promise<OpsStoreState> {
    if (!isTauri()) return emptyOpsStore();
    const { root } = await ensureOpsDirs();
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    const path = storePath(root);
    if (!(await exists(path))) return emptyOpsStore();
    try {
        const raw = await readTextFile(path);
        const parsed = JSON.parse(raw) as OpsStoreState;
        if (!parsed || parsed.version !== 1) return emptyOpsStore();
        return {
            version: 1,
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            publishJobs: Array.isArray(parsed.publishJobs) ? parsed.publishJobs : [],
            snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
        };
    } catch {
        return emptyOpsStore();
    }
}

export async function saveOpsStore(state: OpsStoreState) {
    if (!isTauri()) throw new Error("OPS_DESKTOP_ONLY");
    const { root } = await ensureOpsDirs();
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(storePath(root), JSON.stringify(state, null, 2));
}

export async function accountStatePath(platform: OpsPlatform, accountId: string) {
    const { accounts } = await ensureOpsDirs();
    return joinPath(accounts, `${platform}_${accountId}.json`);
}

export async function upsertOpsAccount(
    input: Omit<OpsAccount, "id" | "createdAt" | "updatedAt" | "statePath" | "status"> & {
        id?: string;
        status?: OpsAccount["status"];
        statePath?: string;
    },
) {
    const state = await loadOpsStore();
    const now = Date.now();
    const id = input.id || nanoid(10);
    const statePath = input.statePath || (await accountStatePath(input.platform, id));
    const existing = state.accounts.find((item) => item.id === id);
    const next: OpsAccount = {
        id,
        platform: input.platform,
        displayName: input.displayName.trim() || `${input.platform}-${id.slice(0, 4)}`,
        statePath,
        status: input.status || existing?.status || "unknown",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        lastLoginAt: existing?.lastLoginAt,
        lastSyncAt: existing?.lastSyncAt,
        note: input.note ?? existing?.note,
    };
    state.accounts = [...state.accounts.filter((item) => item.id !== id), next].sort(
        (a, b) => b.updatedAt - a.updatedAt,
    );
    await saveOpsStore(state);
    return next;
}

export async function removeOpsAccount(accountId: string) {
    const state = await loadOpsStore();
    const account = state.accounts.find((item) => item.id === accountId);
    state.accounts = state.accounts.filter((item) => item.id !== accountId);
    state.publishJobs = state.publishJobs.filter((item) => item.accountId !== accountId);
    state.snapshots = state.snapshots.filter((item) => item.accountId !== accountId);
    await saveOpsStore(state);
    if (account?.statePath && isTauri()) {
        try {
            const { remove, exists } = await import("@tauri-apps/plugin-fs");
            if (await exists(account.statePath)) await remove(account.statePath);
        } catch {
            // ignore cleanup failures
        }
    }
}

export async function markAccountLogin(accountId: string, status: OpsAccount["status"] = "active") {
    const state = await loadOpsStore();
    const now = Date.now();
    state.accounts = state.accounts.map((item) =>
        item.id === accountId
            ? { ...item, status, lastLoginAt: now, updatedAt: now }
            : item,
    );
    await saveOpsStore(state);
}

export async function markAccountSync(accountId: string, status: OpsAccount["status"] = "active") {
    const state = await loadOpsStore();
    const now = Date.now();
    state.accounts = state.accounts.map((item) =>
        item.id === accountId
            ? { ...item, status, lastSyncAt: now, updatedAt: now }
            : item,
    );
    await saveOpsStore(state);
}

export async function enqueuePublishJob(
    input: Omit<OpsPublishJob, "id" | "createdAt" | "updatedAt" | "status">,
) {
    const state = await loadOpsStore();
    const now = Date.now();
    const job: OpsPublishJob = {
        ...input,
        id: nanoid(12),
        status: "queued",
        createdAt: now,
        updatedAt: now,
    };
    state.publishJobs = [job, ...state.publishJobs].slice(0, 200);
    await saveOpsStore(state);
    return job;
}

export async function updatePublishJob(
    jobId: string,
    patch: Partial<Pick<OpsPublishJob, "status" | "error" | "remoteUrl">>,
) {
    const state = await loadOpsStore();
    const now = Date.now();
    state.publishJobs = state.publishJobs.map((job) =>
        job.id === jobId ? { ...job, ...patch, updatedAt: now } : job,
    );
    await saveOpsStore(state);
}

export async function appendMetricsSnapshot(input: {
    accountId: string;
    platform: OpsPlatform;
    items: OpsContentMetrics[];
    capturedAt?: number;
}) {
    const state = await loadOpsStore();
    const capturedAt = input.capturedAt || Date.now();
    const snapshot: OpsMetricsSnapshot = {
        id: nanoid(12),
        accountId: input.accountId,
        platform: input.platform,
        capturedAt,
        dayKey: dayKeyFromMs(capturedAt),
        items: input.items,
    };
    // Keep newest first; cap history.
    state.snapshots = [snapshot, ...state.snapshots].slice(0, 400);
    await saveOpsStore(state);
    await markAccountSync(input.accountId, "active");
    return snapshot;
}

export function latestSnapshotForAccount(state: OpsStoreState, accountId: string) {
    return state.snapshots.find((item) => item.accountId === accountId) || null;
}

export function previousDaySnapshot(state: OpsStoreState, accountId: string, dayKey: string) {
    return (
        state.snapshots.find((item) => item.accountId === accountId && item.dayKey < dayKey) || null
    );
}

export function diffMetrics(
    current?: OpsContentMetrics,
    previous?: OpsContentMetrics,
): Partial<Record<keyof OpsContentMetrics, number>> {
    if (!current || !previous) return {};
    const keys = [
        "playCount",
        "likeCount",
        "commentCount",
        "shareCount",
        "collectCount",
        "homeVisitCount",
        "followerDelta",
        "clickCount",
    ] as const;
    const out: Partial<Record<keyof OpsContentMetrics, number>> = {};
    for (const key of keys) {
        const a = current[key];
        const b = previous[key];
        if (typeof a === "number" && typeof b === "number") out[key] = a - b;
    }
    return out;
}
