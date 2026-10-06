import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { hasSeenConfigOnboarding, useConfigOnboardingStore } from "@canvas/stores/use-config-onboarding-store";
import { useCanvasSidePanelStore } from "@canvas/stores/use-canvas-side-panel-store";
import { useCanvasStore } from "@canvas/stores/canvas/use-canvas-store";

type TargetRect = {
    top: number;
    left: number;
    width: number;
    height: number;
};

type TipStep = "logs" | "tools";

const TARGETS: Record<TipStep, string> = {
    logs: '[data-tour="canvas-logs-tab"]',
    tools: '[data-tour="canvas-tools-fab"]',
};
const PAD = 8;
const STEP_MS = 2200;
const SHOW_DELAY_MS = 350;
const COACH_SEEN_KEY = "canvas-logs-tools-coach-seen";

const CANVAS_RESERVED_SEGMENTS = new Set([
    "image",
    "video",
    "assets",
    "prompts",
    "config",
    "canvas",
]);

function isCanvasProjectPath(pathname: string) {
    const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments[0] === "canvas") segments.shift();
    if (segments[0] === "canvas") segments.shift();
    return segments.length === 1 && !CANVAS_RESERVED_SEGMENTS.has(segments[0]!);
}

function hasSeenLogsToolsCoach() {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(COACH_SEEN_KEY) === "1";
    } catch {
        return true;
    }
}

function markLogsToolsCoachSeen() {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(COACH_SEEN_KEY, "1");
    } catch {
        /* private mode */
    }
}

function readTargetRect(selector: string): TargetRect | null {
    if (typeof document === "undefined") return null;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return {
        top: Math.max(8, rect.top - PAD),
        left: Math.max(8, rect.left - PAD),
        width: Math.min(window.innerWidth - 16, rect.width + PAD * 2),
        height: Math.min(window.innerHeight - 16, rect.height + PAD * 2),
    };
}

/** Soft coach tips on canvas mount: no modal mask; auto-advance then dismiss. */
export function CanvasGenerationLogsRefreshTip() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const reduceMotion = useReducedMotion();
    const onboardingActive = useConfigOnboardingStore((state) => state.active);
    const cloudSynced = useCanvasStore((state) => state.cloudSynced);
    const openPanel = useCanvasSidePanelStore((state) => state.openPanel);
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState<TipStep>("logs");
    const [rect, setRect] = useState<TargetRect | null>(null);

    const isProject = isCanvasProjectPath(pathname);
    const titleKey = step === "logs" ? "canvas.sidePanel.logsRefreshTipTitle" : "canvas.sidePanel.toolsRefreshTipTitle";
    const bodyKey = step === "logs" ? "canvas.sidePanel.logsRefreshTipBody" : "canvas.sidePanel.toolsRefreshTipBody";

    useEffect(() => {
        if (!isProject || onboardingActive || !cloudSynced) {
            setVisible(false);
            setStep("logs");
            return;
        }
        if (!hasSeenConfigOnboarding()) return;
        if (hasSeenLogsToolsCoach()) return;

        openPanel();
        setStep("logs");

        let cancelled = false;
        let retryTimer = 0;
        let tries = 0;
        const tryShow = () => {
            if (cancelled) return;
            // Wait until the real canvas chrome exists so the tip does not overlap loading.
            if (readTargetRect(TARGETS.logs) || readTargetRect(TARGETS.tools)) {
                setVisible(true);
                return;
            }
            tries += 1;
            if (tries < 100) retryTimer = window.setTimeout(tryShow, 100);
        };
        const showTimer = window.setTimeout(tryShow, SHOW_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(showTimer);
            window.clearTimeout(retryTimer);
        };
    }, [cloudSynced, isProject, onboardingActive, openPanel, pathname]);

    // Auto-advance: logs → tools → dismiss. No click required.
    useEffect(() => {
        if (!visible) return;
        const timer = window.setTimeout(() => {
            if (step === "logs") {
                setStep("tools");
                return;
            }
            markLogsToolsCoachSeen();
            setVisible(false);
            setStep("logs");
        }, STEP_MS);
        return () => window.clearTimeout(timer);
    }, [step, visible]);

    useLayoutEffect(() => {
        if (!visible) {
            setRect(null);
            return;
        }
        if (step === "logs" && !panelOpen) {
            setRect(null);
            return;
        }

        let cancelled = false;
        let tries = 0;
        const measure = () => {
            if (cancelled) return;
            const next = readTargetRect(TARGETS[step]);
            if (next) {
                setRect(next);
                return;
            }
            tries += 1;
            if (tries < 40) window.setTimeout(measure, 50);
        };
        measure();

        const onResize = () => setRect(readTargetRect(TARGETS[step]));
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            cancelled = true;
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, [panelOpen, step, visible]);

    const cardStyle = useMemo(() => {
        const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
        const vh = typeof window === "undefined" ? 800 : window.innerHeight;
        const cardWidth = Math.min(300, vw - 32);
        if (!rect) {
            return {
                top: Math.max(24, vh * 0.22),
                left: Math.max(16, step === "tools" ? vw - cardWidth - 24 : 280),
                width: cardWidth,
                place: step === "tools" ? ("left" as const) : ("right" as const),
            };
        }
        if (step === "tools") {
            const left = Math.max(16, rect.left - cardWidth - 18);
            const top = Math.max(16, Math.min(rect.top - 8, vh - 220));
            const place = left + cardWidth < rect.left - 8 ? ("left" as const) : ("above" as const);
            return {
                top: place === "above" ? Math.max(16, rect.top - 180) : top,
                left: place === "above" ? Math.min(Math.max(16, rect.left + rect.width - cardWidth), vw - cardWidth - 16) : left,
                width: cardWidth,
                place,
            };
        }
        const right = rect.left + rect.width + 18;
        const below = rect.top + rect.height + 14;
        const placeRight = right + cardWidth < vw - 16;
        const top = placeRight ? Math.max(16, rect.top - 4) : below;
        const left = placeRight ? right : Math.min(Math.max(16, rect.left), vw - cardWidth - 16);
        return { top, left, width: cardWidth, place: placeRight ? ("right" as const) : ("below" as const) };
    }, [rect, step]);

    if (!visible || typeof document === "undefined") return null;

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-[10900]" aria-live="polite" aria-label={t(titleKey)}>
            {rect ? (
                <motion.div
                    className="pointer-events-none absolute ring-2 ring-sky-400/90"
                    style={{ borderRadius: step === "tools" ? 9999 : 8 }}
                    initial={false}
                    animate={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                        boxShadow: "0 0 0 1px rgba(59,143,232,0.40), 0 8px 24px rgba(15,23,42,0.12)",
                    }}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 30 }}
                />
            ) : null}

            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    className="pointer-events-none absolute z-[10901]"
                    style={{ top: cardStyle.top, left: cardStyle.left, width: cardStyle.width }}
                    initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                >
                    {rect && cardStyle.place === "right" ? (
                        <div className="absolute top-4 -left-2 h-4 w-4 rotate-45 border-b border-l border-sky-300/80 bg-[#f4f8fd] dark:border-sky-500/50 dark:bg-slate-950" />
                    ) : null}
                    {rect && cardStyle.place === "left" ? (
                        <div className="absolute top-4 -right-2 h-4 w-4 rotate-45 border-t border-r border-sky-300/80 bg-[#f4f8fd] dark:border-sky-500/50 dark:bg-slate-950" />
                    ) : null}
                    {rect && (cardStyle.place === "below" || cardStyle.place === "above") ? (
                        <div
                            className={`absolute left-8 h-4 w-4 rotate-45 border-sky-300/80 bg-[#f4f8fd] dark:border-sky-500/50 dark:bg-slate-950 ${
                                cardStyle.place === "below" ? "-top-2 border-t border-l" : "-bottom-2 border-b border-r"
                            }`}
                        />
                    ) : null}
                    <div className="relative overflow-hidden rounded-xl border border-sky-300/70 bg-[#f4f8fd] shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-sky-500/40 dark:bg-slate-950">
                        <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-400" />
                        <div className="space-y-2 p-3.5">
                            <div className="text-[11px] font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-300">{t(titleKey)}</div>
                            <p className="m-0 text-sm leading-6 text-slate-700 dark:text-slate-200">{t(bodyKey)}</p>
                            <div className="text-[11px] opacity-45">{step === "logs" ? "1 / 2" : "2 / 2"}</div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>,
        document.body,
    );
}
