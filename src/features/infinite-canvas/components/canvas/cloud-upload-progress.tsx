import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
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
    return useSyncExternalStore(subscribeCloudUpload, getCloudUploadSnapshot, getCloudUploadSnapshot);
}

function statusLabel(job: CloudUploadJobView, t: (key: string) => string) {
    if (job.status === "failed") return t("canvas.cloudUpload.failed");
    if (job.status === "waiting") return t("canvas.cloudUpload.waiting");
    return t("canvas.cloudUpload.uploading");
}

export function CloudUploadProgress({
    variant = "canvas",
    open,
    onOpenChange,
    toolbar,
}: {
    variant?: "canvas" | "page" | "toolbar";
    /** Controlled open state (toolbar). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** When embedded in the bottom canvas dock. */
    toolbar?: {
        hovered: string | null;
        hoverStyle: CSSProperties;
        activeStyle: CSSProperties;
        wrapRef: RefObject<HTMLDivElement | null>;
        onTipX: (x: number) => void;
        onHover: (id: string | null) => void;
    };
}) {
    const progress = useCloudUploadProgress();
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
    const [retryingId, setRetryingId] = useState<number | null>(null);
    const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const controlled = typeof open === "boolean";
    const expanded = controlled ? open : uncontrolledExpanded;
    const setExpanded = (next: boolean | ((value: boolean) => boolean)) => {
        const value = typeof next === "function" ? next(expanded) : next;
        if (controlled) onOpenChange?.(value);
        else setUncontrolledExpanded(value);
    };

    const current = progress.current;
    const percent = current ? Math.min(100, Math.round((current.loaded / current.total) * 100)) : 0;
    const jobs = progress.pending;
    const hasFailed = progress.failedCount > 0;
    const hasJobs = progress.count > 0;
    const positionClass =
        variant === "page" ? "fixed bottom-6 right-6" : variant === "toolbar" ? "relative" : "absolute bottom-[88px] right-5";

    const updatePanelPos = () => {
        const button = buttonRef.current;
        if (!button) return;
        const rect = button.getBoundingClientRect();
        setPanelPos({
            left: rect.left + rect.width / 2,
            bottom: Math.max(8, window.innerHeight - rect.top + 10),
        });
    };

    useLayoutEffect(() => {
        if (!expanded || variant !== "toolbar") {
            setPanelPos(null);
            return;
        }
        updatePanelPos();
    }, [expanded, variant]);

    useEffect(() => {
        if (!expanded || variant !== "toolbar") return;
        const handle = () => updatePanelPos();
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [expanded, variant]);

    useEffect(() => {
        if (!expanded) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                const panel = document.getElementById("canvas-cloud-upload-panel");
                if (panel?.contains(event.target as Node)) return;
                setExpanded(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [expanded]);

    const handleRetry = (id: number) => {
        if (retryingId != null) return;
        setRetryingId(id);
        void retryCloudUpload(id).finally(() => setRetryingId((currentId) => (currentId === id ? null : currentId)));
    };

    const panelBody = (
        <>
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
                    {hasFailed
                        ? t("canvas.cloudUpload.failedHint")
                        : hasJobs
                          ? t("canvas.cloudUpload.pendingTitle")
                          : t("canvas.cloudUpload.empty")}
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
        </>
    );

    const panelClassName = cn(
        "pointer-events-auto z-[60] w-[280px] rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur",
        variant === "toolbar" ? null : positionClass,
    );
    const panelStyle = {
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
        color: theme.node.text,
        ...(variant === "toolbar" && panelPos
            ? { position: "fixed" as const, left: panelPos.left, bottom: panelPos.bottom, transform: "translateX(-50%)" }
            : null),
    };

    const panel =
        expanded && (variant !== "toolbar" || panelPos) ? (
            <div
                id="canvas-cloud-upload-panel"
                className={panelClassName}
                style={panelStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {panelBody}
            </div>
        ) : null;

    if (variant === "toolbar" && toolbar) {
        const id = "tool-cloud-upload";
        const active = expanded;
        const hovered = toolbar.hovered === id;
        return (
            <div ref={rootRef} className="relative">
                <button
                    ref={buttonRef}
                    type="button"
                    aria-label={t("canvas.cloudUpload.title")}
                    aria-expanded={expanded}
                    className="relative inline-flex !h-8 !w-8 !min-w-8 items-center justify-center rounded-md border-0 bg-transparent p-0 transition"
                    style={
                        active
                            ? toolbar.activeStyle
                            : hovered
                              ? toolbar.hoverStyle
                              : { color: hasFailed ? "#ef4444" : theme.toolbar.item }
                    }
                    onMouseEnter={(event) => {
                        toolbar.onHover(id);
                        toolbar.onTipX(getTipX(toolbar.wrapRef.current, event.currentTarget));
                    }}
                    onMouseLeave={() => toolbar.onHover(null)}
                    onClick={() => setExpanded((value) => !value)}
                >
                    <CloudUpload className="size-4.5" />
                    {hasJobs ? (
                        <span
                            className={cn(
                                "absolute -right-0.5 -top-0.5 inline-flex min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-3.5 text-white",
                                hasFailed ? "bg-red-500" : "bg-sky-500",
                            )}
                        >
                            {progress.count}
                        </span>
                    ) : null}
                </button>
                {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
            </div>
        );
    }

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
                {hasJobs ? (
                    <span
                        className={cn(
                            "absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 text-white",
                            hasFailed ? "bg-red-500" : "bg-sky-500",
                        )}
                    >
                        {progress.count}
                    </span>
                ) : null}
            </button>
        );
    }

    return panel;
}

function getTipX(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - wrapBox.left + box.width / 2;
}
