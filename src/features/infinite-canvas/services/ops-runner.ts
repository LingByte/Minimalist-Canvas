import { nanoid } from "nanoid";

import type {
    OpsContentMetrics,
    OpsRunnerProgressEvent,
    OpsRunnerRequest,
} from "@canvas/lib/ops/types";
import { isTauri } from "@canvas/services/fs-store";

export type OpsProgressHandler = (event: OpsRunnerProgressEvent) => void;

function assertDesktop() {
    if (!isTauri()) throw new Error("OPS_DESKTOP_ONLY");
}

export async function isOpsRunnerAvailable() {
    if (!isTauri()) return false;
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        return Boolean(await invoke<boolean>("ops_runner_available"));
    } catch {
        return false;
    }
}

export async function cancelOpsJob() {
    if (!isTauri()) return false;
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        return Boolean(await invoke<boolean>("ops_cancel"));
    } catch {
        return false;
    }
}

export async function runOpsJob(
    request: OpsRunnerRequest,
    onProgress?: OpsProgressHandler,
): Promise<unknown> {
    assertDesktop();
    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");
    const jobId = nanoid(10);

    const unlisten = await listen<{ jobId: string; event: OpsRunnerProgressEvent }>(
        "ops-progress",
        (event) => {
            if (event.payload.jobId !== jobId) return;
            onProgress?.(event.payload.event);
        },
    );

    try {
        return await invoke("ops_run", {
            jobId,
            payload: {
                request,
            },
        });
    } finally {
        unlisten();
    }
}

/**
 * Off-screen Chrome login — QR is extracted into the app UI.
 * (True headless often fails to render creator QR codes.)
 */
export async function runOpsLogin(
    request: Omit<OpsRunnerRequest, "command">,
    onProgress?: OpsProgressHandler,
) {
    return runOpsJob({ ...request, command: "login", headless: false }, onProgress);
}

export async function runOpsCheck(
    request: Omit<OpsRunnerRequest, "command">,
    onProgress?: OpsProgressHandler,
) {
    return runOpsJob({ ...request, command: "check", headless: true }, onProgress);
}

export async function runOpsPublish(
    request: Omit<OpsRunnerRequest, "command"> & {
        videoPath: string;
        title: string;
    },
    onProgress?: OpsProgressHandler,
) {
    return runOpsJob({ ...request, command: "publish", headless: true }, onProgress);
}

export async function runOpsSync(
    request: Omit<OpsRunnerRequest, "command">,
    onProgress?: OpsProgressHandler,
): Promise<{ items: OpsContentMetrics[] }> {
    const result = (await runOpsJob(
        { ...request, command: "sync", headless: true },
        onProgress,
    )) as { items?: OpsContentMetrics[] } | null;
    return { items: Array.isArray(result?.items) ? result.items : [] };
}
