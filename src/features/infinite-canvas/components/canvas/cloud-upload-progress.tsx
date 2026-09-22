import { useState, useSyncExternalStore } from "react";
import { CloudUpload, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import {
    cancelCloudUpload,
    dismissAllFailedCloudUploads,
    dismissCloudUpload,
    getCloudUploadSnapshot,
    retryCloudUpload,
    subscribeCloudUpload,
    type CloudUploadJobView,
} from "@canvas/services/cloud-upload-progress";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { cn } from "@/lib/utils";

function useCloudUploadProgress() {
    return useSyncExternalStore(subscribeCloudUpload, getCloudUploadSnapshot, () => null);
}

function statusLabel(job: CloudUploadJobView, t: (key: string) => string) {
    if (job.status === "failed") return t("canvas.cloudUpload.failed");
    if (job.status === "waiting") return t("canvas.cloudUpload.waiting");
    return t("canvas.cloudUpload.uploading");
}

export function CloudUploadProgress({ variant = "canvas" }: { variant?: "canvas" | "page" }) {
    const progress = useCloudUploadProgress();
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expanded, setExpanded] = useState(false);
    const [retryingId, setRetryingId] = useState<number | null>(null);
    if (!progress) return null;

    const current = progress.current;
    const percent = current ? Math.min(100, Math.round((current.loaded / current.total) * 100)) : 0;
    const jobs = progress.pending;
    const hasFailed = progress.failedCount > 0;
    const positionClass = variant === "page" ? "fixed bottom-6 right-6" : "absolute bottom-[88px] right-5";

    const handleRetry = (id: number) => {
        if (retryingId != null) return;
        setRetryingId(id);
        void retryCloudUpload(id).finally(() => setRetryingId((currentId) => (currentId === id ? null : currentId)));
    };

    if (!expanded) {
        return (
            <button
                type="button"
                className={cn(
                    "pointer-events-auto z-50 inline-flex size-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition hover:scale-[1.03]",
                    positionClass,
                )}
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                aria-label={t("canvas.cloudUpload.title")}
                title={t("canvas.cloudUpload.title")}
                onClick={() => setExpanded(true)}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <CloudUpload className="size-4" style={{ color: hasFailed ? "#ef4444" : theme.node.muted }} />
                <span
                    className={cn(
                        "absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 text-white",
                        hasFailed ? "bg-red-500" : "bg-sky-500",
                    )}
                >
                    {progress.count}
                </span>
            </button>
        );
    }

    return (
        <div
            className={cn("pointer-events-auto z-50 w-[280px] rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur", positionClass)}
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="flex items-center gap-2">
                <CloudUpload className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{t("canvas.cloudUpload.title")}</span>
                {hasFailed ? (
                    <button
                        type="button"
                        className="shrink-0 text-[11px] text-stone-500 underline-offset-2 hover:underline"
                        onClick={() => dismissAllFailedCloudUploads()}
                    >
                        {t("canvas.cloudUpload.dismissFailed")}
                    </button>
                ) : null}
                <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded-md text-stone-500 transition hover:bg-black/5 hover:text-stone-800 dark:hover:bg-white/10 dark:hover:text-stone-100"
                    aria-label={t("canvas.cloudUpload.collapse")}
                    title={t("canvas.cloudUpload.collapse")}
                    onClick={() => setExpanded(false)}
                >
                    <X className="size-3.5" />
                </button>
            </div>

            {current && current.status !== "failed" ? (
                <div className="mt-2">
                    <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs" title={current.name}>
                            {current.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums">{percent}%</span>
                        <button
                            type="button"
                            className="shrink-0 text-[11px] text-stone-500 hover:text-red-500"
                            onClick={() => cancelCloudUpload(current.id)}
                        >
                            {t("canvas.cloudUpload.cancel")}
                        </button>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${percent}%`, background: theme.node.activeStroke }} />
                    </div>
                </div>
            ) : (
                <div className="mt-2 text-xs" style={{ color: theme.node.muted }}>
                    {hasFailed ? t("canvas.cloudUpload.failedHint") : t("canvas.cloudUpload.pendingTitle")}
                </div>
            )}

            {jobs.length ? (
                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto border-t pt-2" style={{ borderColor: theme.toolbar.border }}>
                    {jobs.map((job) => (
                        <div key={job.id} className="flex items-center gap-2 text-[11px]">
                            <span className="min-w-0 flex-1 truncate" title={job.name}>
                                {job.name}
                            </span>
                            <span className="shrink-0" style={{ color: job.status === "failed" ? "#ef4444" : theme.node.muted }}>
                                {statusLabel(job, t)}
                            </span>
                            {job.status === "failed" ? (
                                <>
                                    <button
                                        type="button"
                                        className="inline-flex shrink-0 items-center gap-0.5 text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 disabled:opacity-50"
                                        aria-label={t("canvas.cloudUpload.retry")}
                                        title={t("canvas.cloudUpload.retry")}
                                        disabled={retryingId === job.id}
                                        onClick={() => handleRetry(job.id)}
                                    >
                                        <RefreshCw className={cn("size-3", retryingId === job.id && "animate-spin")} />
                                        {t("canvas.cloudUpload.retry")}
                                    </button>
                                    <button
                                        type="button"
                                        className="shrink-0 text-stone-500 hover:text-stone-800 dark:hover:text-stone-100"
                                        aria-label={t("canvas.cloudUpload.dismiss")}
                                        onClick={() => dismissCloudUpload(job.id)}
                                    >
                                        <X className="size-3" />
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    className="shrink-0 text-stone-500 hover:text-red-500"
                                    aria-label={t("canvas.cloudUpload.cancel")}
                                    onClick={() => cancelCloudUpload(job.id)}
                                >
                                    <X className="size-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
