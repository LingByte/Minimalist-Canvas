import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ImagePlus, Sparkles, X } from "lucide-react";
import { Button } from "antd";

import { cn } from "@/lib/utils";

const MODE_TABS = [
    { href: "/image", labelKey: "workbench.imageMode" },
    { href: "/video", labelKey: "workbench.videoMode" },
] as const;

export function WorkbenchModeTabs(props: { className?: string }) {
    const { t } = useTranslation();
    const { pathname } = useLocation();

    return (
        <nav
            className={cn("flex items-center gap-6 px-0.5", props.className)}
            aria-label={t("workbench.modes")}
        >
            {MODE_TABS.map((tab) => {
                const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
                return (
                    <Link
                        key={tab.href}
                        to={tab.href}
                        className={cn(
                            "relative pb-2.5 text-[15px] font-medium tracking-wide transition-colors",
                            active
                                ? "text-stone-950 dark:text-white"
                                : "text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200"
                        )}
                        aria-current={active ? "page" : undefined}
                    >
                        {t(tab.labelKey)}
                        {active ? (
                            <span
                                aria-hidden
                                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-emerald-400"
                            />
                        ) : null}
                    </Link>
                );
            })}
        </nav>
    );
}

/** Large Jimeng-style dashed reference drop zone. */
export function WorkbenchReferenceZone(props: {
    title: string;
    countLabel: string;
    children: ReactNode;
    actions?: ReactNode;
    dragActive?: boolean;
    className?: string;
    onDragEnter?: React.DragEventHandler<HTMLDivElement>;
    onDragOver?: React.DragEventHandler<HTMLDivElement>;
    onDragLeave?: React.DragEventHandler<HTMLDivElement>;
    onDrop?: React.DragEventHandler<HTMLDivElement>;
    onWheel?: React.WheelEventHandler<HTMLDivElement>;
}) {
    return (
        <div className={cn("min-w-0", props.className)}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">{props.title}</span>
                <span className="text-xs tabular-nums text-stone-400">{props.countLabel}</span>
            </div>
            <div
                className={cn(
                    "hover-scrollbar hover-scrollbar-hint relative flex min-h-[8.5rem] w-full min-w-0 max-w-full gap-2.5 overflow-x-auto overflow-y-hidden rounded-2xl border border-dashed p-3.5 pb-4 overscroll-x-contain transition-colors",
                    props.dragActive
                        ? "border-emerald-400 bg-emerald-400/10 dark:border-emerald-400/70"
                        : "border-stone-300/90 bg-stone-50/50 dark:border-stone-700 dark:bg-stone-950/40"
                )}
                onDragEnter={props.onDragEnter}
                onDragOver={props.onDragOver}
                onDragLeave={props.onDragLeave}
                onDrop={props.onDrop}
                onWheel={props.onWheel}
            >
                {props.children}
            </div>
            {props.actions ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-0.5 text-stone-500 [&_button]:!px-1.5 [&_button]:!text-xs [&_button]:!text-stone-500 dark:[&_button]:!text-stone-400">
                    {props.actions}
                </div>
            ) : null}
        </div>
    );
}

export function WorkbenchAddTile(props: {
    onClick?: () => void;
    label?: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={cn(
                "grid size-[5.5rem] shrink-0 place-items-center rounded-2xl border border-dashed border-stone-300/90 bg-stone-100/80 text-stone-400 transition hover:border-emerald-400 hover:bg-emerald-400/10 hover:text-emerald-600 dark:border-stone-700 dark:bg-stone-900/80 dark:hover:border-emerald-400/60 dark:hover:text-emerald-300",
                props.className
            )}
            aria-label={props.label}
        >
            <ImagePlus className="size-7 opacity-80" />
        </button>
    );
}

/** Placeholder tile shown while a reference file is uploading. */
export function WorkbenchUploadingTile(props: {
    name: string;
    previewUrl?: string;
    progress: number;
    kind?: "image" | "video" | "audio";
    onCancel?: () => void;
}) {
    const { t } = useTranslation();
    const percent = Math.min(100, Math.max(0, Math.round(props.progress)));
    return (
        <div className="relative size-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900">
            {props.previewUrl && props.kind !== "audio" ? (
                props.kind === "video" ? (
                    <video src={props.previewUrl} muted className="size-full object-cover opacity-50" />
                ) : (
                    <img src={props.previewUrl} alt="" className="size-full object-cover opacity-50" />
                )
            ) : (
                <div className="grid size-full place-items-center text-stone-400">
                    <ImagePlus className="size-6 opacity-60" />
                </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/45 px-2 text-white">
                <span className="text-[11px] font-semibold tabular-nums">{percent}%</span>
                <div className="h-1 w-full max-w-[4.5rem] overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-150" style={{ width: `${percent}%` }} />
                </div>
                <span className="w-full truncate text-center text-[9px] opacity-80" title={props.name}>
                    {props.name}
                </span>
            </div>
            {props.onCancel ? (
                <button
                    type="button"
                    className="absolute right-1 top-1 z-10 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                    aria-label={t("workbench.cancelUpload")}
                    title={t("workbench.cancelUpload")}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        props.onCancel?.();
                    }}
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </div>
    );
}

export function WorkbenchBottomBar(props: {
    summary: ReactNode;
    /** Compact settings panel content shown in a floating popover above the summary pill. */
    settings?: ReactNode;
    settingsOpen?: boolean;
    onSettingsOpenChange?: (open: boolean) => void;
    onOpenSettings?: () => void;
    generateLabel: string;
    /** Optional unit-price hint shown on the generate button (e.g. "2.99元一条"). */
    generatePrice?: string;
    /** Short tip under the generate button (e.g. retention notice). */
    generateTip?: string;
    generating?: boolean;
    disabled?: boolean;
    onGenerate: () => void;
    className?: string;
}) {
    const pillRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const [pillRect, setPillRect] = useState<DOMRect | null>(null);
    const controlled = props.settingsOpen !== undefined;
    const open = controlled ? Boolean(props.settingsOpen) : uncontrolledOpen;

    const setOpen = (next: boolean) => {
        if (!controlled) setUncontrolledOpen(next);
        props.onSettingsOpenChange?.(next);
    };

    const toggle = () => {
        if (props.settings) {
            setOpen(!open);
            return;
        }
        props.onOpenSettings?.();
    };

    useEffect(() => {
        if (!open || !props.settings) return;
        const sync = () => setPillRect(pillRef.current?.getBoundingClientRect() || null);
        const onPointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (pillRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        sync();
        window.addEventListener("resize", sync);
        window.addEventListener("scroll", sync, true);
        window.addEventListener("pointerdown", onPointer, true);
        return () => {
            window.removeEventListener("resize", sync);
            window.removeEventListener("scroll", sync, true);
            window.removeEventListener("pointerdown", onPointer, true);
        };
    }, [open, props.settings]);

    const width = 440;
    const gap = 10;
    const margin = 12;
    const panel =
        open && props.settings && pillRect
            ? createPortal(
                  <div
                      ref={panelRef}
                      className="thin-scrollbar rounded-2xl border border-stone-200/90 bg-card p-3.5 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-[#16171c]"
                      style={{
                          position: "fixed",
                          zIndex: 1200,
                          width,
                          left: Math.max(margin, Math.min(window.innerWidth - width - margin, pillRect.left)),
                          bottom: window.innerHeight - pillRect.top + gap,
                          maxHeight: Math.max(240, pillRect.top - margin * 2),
                          overflowX: "hidden",
                          overflowY: "auto",
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                  >
                      {props.settings}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div
            className={cn(
                "sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-1.5 border-t border-stone-200/70 bg-card/95 px-4 py-3 backdrop-blur-md dark:border-stone-800/80",
                props.className
            )}
        >
            <div className="flex items-center gap-3">
                <button
                    ref={pillRef}
                    type="button"
                    onClick={toggle}
                    aria-expanded={props.settings ? open : undefined}
                    className="inline-flex min-w-0 max-w-[58%] items-center gap-2 rounded-full border border-stone-200/90 bg-stone-50 px-3.5 py-2.5 text-left text-xs font-medium text-stone-700 transition hover:border-emerald-400/40 hover:bg-emerald-400/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                >
                    <span className="min-w-0 flex-1 truncate">{props.summary}</span>
                    <ChevronDown className={cn("size-3.5 shrink-0 opacity-50 transition-transform", open && props.settings && "rotate-180")} />
                </button>
                <Button
                    type="primary"
                    size="large"
                    loading={props.generating}
                    disabled={props.disabled}
                    onClick={props.onGenerate}
                    className="!ml-auto !h-11 !min-w-[8.5rem] !max-w-[14rem] !rounded-xl !border-0 !bg-[#00b0f0] !px-4 !font-semibold !text-white !shadow-none hover:!bg-[#33c3f5]"
                    icon={<Sparkles className="size-4" />}
                >
                    <span className="inline-flex max-w-full flex-col items-start gap-0 leading-tight">
                        <span>{props.generateLabel}</span>
                        {props.generatePrice ? <span className="max-w-full truncate text-[10px] font-medium opacity-90">{props.generatePrice}</span> : null}
                    </span>
                </Button>
            </div>
            {props.generateTip ? (
                <p className="ml-auto max-w-[min(100%,22rem)] text-right text-[10px] leading-snug text-stone-500 dark:text-stone-400">
                    {props.generateTip}
                </p>
            ) : null}
            {panel}
        </div>
    );
}

export function workbenchPageClassName() {
    return "flex h-full flex-col overflow-hidden bg-stone-100 text-stone-900 dark:bg-[#0c0d10] dark:text-stone-100";
}

export function workbenchComposerClassName() {
    return "thin-scrollbar relative flex flex-col rounded-2xl border border-stone-200/80 bg-card p-4 shadow-sm dark:border-stone-800 dark:bg-[#14151a] lg:min-h-0 lg:overflow-y-auto";
}

export function workbenchResultsClassName() {
    return "thin-scrollbar rounded-2xl border border-stone-200/80 bg-card p-4 shadow-sm dark:border-stone-800 dark:bg-[#14151a] lg:min-h-0 lg:overflow-y-auto lg:p-5";
}

export function workbenchPromptShellClassName() {
    return "relative rounded-2xl border border-stone-200/90 bg-stone-50/60 focus-within:border-emerald-400/40 dark:border-stone-800 dark:bg-stone-950/60 dark:focus-within:border-emerald-400/30";
}

export function workbenchAsideClassName() {
    return "thin-scrollbar hidden min-h-0 overflow-x-hidden overflow-y-auto rounded-2xl border border-stone-200/80 bg-card p-4 shadow-sm dark:border-stone-800 dark:bg-[#14151a] lg:block";
}
