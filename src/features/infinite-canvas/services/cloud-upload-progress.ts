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
};

type Job = CloudUploadJobView;

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
            current,
            pending: jobs.map((job) => ({ ...job })),
        };
    }
    listeners.forEach((listener) => listener());
}

export function beginCloudUpload(name: string, total: number) {
    const id = nextId++;
    const job: Job = {
        id,
        name: name || "file",
        loaded: 0,
        total: Math.max(total, 1),
        status: jobs.some((item) => item.status === "uploading") ? "waiting" : "uploading",
    };
    jobs = [...jobs, job];
    publish();
    return {
        progress(loaded: number, fileTotal: number) {
            jobs = jobs.map((item) =>
                item.id === id
                    ? { ...item, status: "uploading" as const, loaded, total: Math.max(fileTotal || item.total, 1) }
                    : item,
            );
            publish();
        },
        finish(ok: boolean) {
            const job = jobs.find((item) => item.id === id);
            if (!job) return;
            if (ok) {
                jobs = jobs.filter((item) => item.id !== id);
                if (!jobs.some((item) => item.status === "uploading")) {
                    const next = jobs.find((item) => item.status === "waiting");
                    if (next) jobs = jobs.map((item) => (item.id === next.id ? { ...item, status: "uploading" } : item));
                }
                publish();
                return;
            }
            jobs = jobs.map((item) => (item.id === id ? { ...item, status: "failed" } : item));
            publish();
        },
    };
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
