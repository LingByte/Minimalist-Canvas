export type CloudUploadJobStatus = "uploading" | "waiting" | "failed";

export type CloudUploadJobView = {
    id: number;
    name: string;
    loaded: number;
    total: number;
    status: CloudUploadJobStatus;
};

export type CloudUploadSnapshot = {
    current: CloudUploadJobView | null;
    pending: CloudUploadJobView[];
    /** Active + failed jobs that should keep the badge visible. */
    count: number;
    failedCount: number;
};

type RetryFn = (signal: AbortSignal, onProgress: (loaded: number, total: number) => void) => Promise<boolean>;

type Job = CloudUploadJobView & {
    controller: AbortController;
    retry?: RetryFn;
};

let nextId = 1;
let jobs: Job[] = [];
let snapshot: CloudUploadSnapshot | null = null;
const listeners = new Set<() => void>();
const urlListeners = new Set<(storageKey: string, url: string) => void>();

function publish() {
    if (!jobs.length) {
        snapshot = null;
    } else {
        const current = jobs.find((job) => job.status === "uploading") || jobs.find((job) => job.status === "waiting") || null;
        snapshot = {
            current: current
                ? { id: current.id, name: current.name, loaded: current.loaded, total: current.total, status: current.status }
                : null,
            pending: jobs.map(({ id, name, loaded, total, status }) => ({ id, name, loaded, total, status })),
            count: jobs.length,
            failedCount: jobs.filter((job) => job.status === "failed").length,
        };
    }
    listeners.forEach((listener) => listener());
}

function promoteNextWaiting() {
    if (jobs.some((item) => item.status === "uploading")) return;
    const next = jobs.find((item) => item.status === "waiting");
    if (next) jobs = jobs.map((item) => (item.id === next.id ? { ...item, status: "uploading" } : item));
}

export function beginCloudUpload(name: string, total: number) {
    const id = nextId++;
    const controller = new AbortController();
    const job: Job = {
        id,
        name: name || "file",
        loaded: 0,
        total: Math.max(total, 1),
        status: jobs.some((item) => item.status === "uploading") ? "waiting" : "uploading",
        controller,
    };
    jobs = [...jobs, job];
    publish();
    return {
        id,
        signal: controller.signal,
        progress(loaded: number, fileTotal: number) {
            jobs = jobs.map((item) =>
                item.id === id
                    ? { ...item, status: "uploading" as const, loaded, total: Math.max(fileTotal || item.total, 1) }
                    : item,
            );
            publish();
        },
        setRetry(retry: RetryFn) {
            jobs = jobs.map((item) => (item.id === id ? { ...item, retry } : item));
        },
        finish(ok: boolean) {
            const current = jobs.find((item) => item.id === id);
            if (!current) return;
            if (ok) {
                jobs = jobs.filter((item) => item.id !== id);
                promoteNextWaiting();
                publish();
                return;
            }
            jobs = jobs.map((item) => (item.id === id ? { ...item, status: "failed" as const } : item));
            promoteNextWaiting();
            publish();
        },
        cancel() {
            cancelCloudUpload(id);
        },
    };
}

export function cancelCloudUpload(id: number) {
    const job = jobs.find((item) => item.id === id);
    if (!job) return;
    try {
        job.controller.abort();
    } catch {
        // ignore
    }
    jobs = jobs.filter((item) => item.id !== id);
    promoteNextWaiting();
    publish();
}

export function dismissCloudUpload(id: number) {
    jobs = jobs.filter((item) => item.id !== id);
    publish();
}

export function dismissAllFailedCloudUploads() {
    jobs = jobs.filter((item) => item.status !== "failed");
    publish();
}

/** Re-run a failed upload. Returns false when the job cannot be retried. */
export async function retryCloudUpload(id: number): Promise<boolean> {
    const job = jobs.find((item) => item.id === id && item.status === "failed");
    if (!job?.retry) return false;

    const retry = job.retry;
    const controller = new AbortController();
    jobs = jobs.map((item) =>
        item.id === id
            ? {
                  ...item,
                  controller,
                  loaded: 0,
                  status: (jobs.some((other) => other.id !== id && other.status === "uploading")
                      ? "waiting"
                      : "uploading") as CloudUploadJobStatus,
              }
            : item,
    );
    publish();

    const onProgress = (loaded: number, total: number) => {
        jobs = jobs.map((item) =>
            item.id === id
                ? { ...item, status: "uploading" as const, loaded, total: Math.max(total || item.total, 1) }
                : item,
        );
        publish();
    };

    try {
        const ok = await retry(controller.signal, onProgress);
        if (ok) {
            jobs = jobs.filter((item) => item.id !== id);
            promoteNextWaiting();
            publish();
            return true;
        }
        jobs = jobs.map((item) => (item.id === id ? { ...item, status: "failed" as const } : item));
        promoteNextWaiting();
        publish();
        return false;
    } catch {
        if (controller.signal.aborted) {
            jobs = jobs.filter((item) => item.id !== id);
            promoteNextWaiting();
            publish();
            return false;
        }
        jobs = jobs.map((item) => (item.id === id ? { ...item, status: "failed" as const } : item));
        promoteNextWaiting();
        publish();
        return false;
    }
}

/** Canvas nodes keep a local blob URL first; swap in the public URL once cloud upload finishes. */
export function publishCloudMediaUrl(storageKey: string, url: string) {
    if (!storageKey || !url) return;
    urlListeners.forEach((listener) => listener(storageKey, url));
}

export function onCloudMediaUrl(listener: (storageKey: string, url: string) => void) {
    urlListeners.add(listener);
    return () => {
        urlListeners.delete(listener);
    };
}

export function subscribeCloudUpload(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getCloudUploadSnapshot() {
    return snapshot;
}
