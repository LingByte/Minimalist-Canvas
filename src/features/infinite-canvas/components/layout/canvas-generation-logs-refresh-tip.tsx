import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { hasSeenConfigOnboarding, useConfigOnboardingStore } from "@canvas/stores/use-config-onboarding-store";
import { useCanvasSidePanelStore } from "@canvas/stores/use-canvas-side-panel-store";

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

function isCanvasProjectPath(pathname: string) {
    return /^\/canvas\/(?:canvas\/)?[^/]+$/.test(pathname);
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
    const openPanel = useCanvasSidePanelStore((state) => state.openPanel);
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState<TipStep>("logs");
    const [rect, setRect] = useState<TargetRect | null>(null);

    const isProject = isCanvasProjectPath(pathname);
    const titleKey = step === "logs" ? "canvas.sidePanel.logsRefreshTipTitle" : "canvas.sidePanel.toolsRefreshTipTitle";
    const bodyKey = step === "logs" ? "canvas.sidePanel.logsRefreshTipBody" : "canvas.sidePanel.toolsRefreshTipBody";

    useEffect(() => {
        if (!isProject || onboardingActive) {
            setVisible(false);
            setStep("logs");
            return;
        }
        if (!hasSeenConfigOnboarding()) return;

        openPanel();
        setStep("logs");
        const showTimer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => window.clearTimeout(showTimer);
    }, [isProject, onboardingActive, openPanel, pathname]);

    // Auto-advance: logs → tools → dismiss. No click required.
    useEffect(() => {
        if (!visible) return;
        const timer = window.setTimeout(() => {
            if (step === "logs") {
                setStep("tools");
                return;
            }
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
                    className="pointer-events-none absolute ring-2 ring-amber-400/90"
                    style={{ borderRadius: step === "tools" ? 9999 : 8 }}
                    initial={false}
                    animate={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                        boxShadow: "0 0 0 1px rgba(251,191,36,0.35), 0 8px 24px rgba(0,0,0,0.12)",
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
                        <div className="absolute top-4 -left-2 h-4 w-4 rotate-45 border-b border-l border-amber-300/80 bg-[#fffaf3] dark:border-amber-500/50 dark:bg-stone-950" />
                    ) : null}
                    {rect && cardStyle.place === "left" ? (
                        <div className="absolute top-4 -right-2 h-4 w-4 rotate-45 border-t border-r border-amber-300/80 bg-[#fffaf3] dark:border-amber-500/50 dark:bg-stone-950" />
                    ) : null}
                    {rect && (cardStyle.place === "below" || cardStyle.place === "above") ? (
                        <div
                            className={`absolute left-8 h-4 w-4 rotate-45 border-amber-300/80 bg-[#fffaf3] dark:border-amber-500/50 dark:bg-stone-950 ${
                                cardStyle.place === "below" ? "-top-2 border-t border-l" : "-bottom-2 border-b border-r"
                            }`}
                        />
                    ) : null}
                    <div className="relative overflow-hidden rounded-xl border border-amber-300/80 bg-[#fffaf3] shadow-[0_18px_50px_rgba(28,25,23,0.22)] dark:border-amber-500/40 dark:bg-stone-950">
                        <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400" />
                        <div className="space-y-2 p-3.5">
                            <div className="text-[11px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">{t(titleKey)}</div>
                            <p className="m-0 text-sm leading-6 text-stone-700 dark:text-stone-200">{t(bodyKey)}</p>
                            <div className="text-[11px] opacity-45">{step === "logs" ? "1 / 2" : "2 / 2"}</div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>,
        document.body,
    );
}
