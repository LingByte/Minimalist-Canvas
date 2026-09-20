import { useSyncExternalStore } from "react";
import { CloudUpload } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { subscribeCloudUpload, getCloudUploadSnapshot, type CloudUploadJobView } from "@canvas/services/cloud-upload-progress";
import { useThemeStore } from "@canvas/stores/use-theme-store";

function useCloudUploadProgress() {
    return useSyncExternalStore(subscribeCloudUpload, getCloudUploadSnapshot, () => null);
}

function statusLabel(job: CloudUploadJobView, t: (key: string) => string) {
    if (job.status === "failed") return t("canvas.cloudUpload.failed");
    if (job.status === "waiting") return t("canvas.cloudUpload.waiting");
    return t("canvas.cloudUpload.uploading");
}

export function CloudUploadProgress() {
    const progress = useCloudUploadProgress();
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!progress) return null;

    const current = progress.current;
    const percent = current ? Math.min(100, Math.round((current.loaded / current.total) * 100)) : 0;
    const pending = progress.pending.filter((job) => job.status !== "uploading" || job.id !== current?.id);

    return (
        <div
            className="pointer-events-auto absolute bottom-[88px] right-5 z-50 w-[280px] rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {current ? (
                <>
                    <div className="flex items-center gap-2">
                        <CloudUpload className="size-3.5 shrink-0" style={{ color: theme.node.muted }} />
                        <span className="min-w-0 flex-1 truncate text-xs" style={{ color: theme.node.muted }}>
                            {t("canvas.cloudUpload.title")}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums">{percent}%</span>
                    </div>
                    <div className="mt-1 truncate text-xs" title={current.name}>
                        {current.name}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: theme.node.stroke }}>
                        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${percent}%`, background: theme.node.activeStroke }} />
                    </div>
                </>
            ) : (
                <div className="flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                    <CloudUpload className="size-3.5 shrink-0" />
                    {t("canvas.cloudUpload.pendingTitle")}
                </div>
            )}
            {pending.length ? (
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto border-t pt-2" style={{ borderColor: theme.toolbar.border }}>
                    <div className="text-[11px]" style={{ color: theme.node.muted }}>
                        {t("canvas.cloudUpload.pendingTitle")}
                    </div>
                    {pending.map((job) => (
                        <div key={job.id} className="flex items-center gap-2 text-[11px]">
                            <span className="min-w-0 flex-1 truncate" title={job.name}>
                                {job.name}
                            </span>
                            <span className="shrink-0" style={{ color: job.status === "failed" ? "#ef4444" : theme.node.muted }}>
                                {statusLabel(job, t)}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
