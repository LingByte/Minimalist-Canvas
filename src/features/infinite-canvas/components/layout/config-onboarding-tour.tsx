import { Button } from "antd";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useConfigStore } from "@canvas/stores/use-config-store";
import {
    CONFIG_ONBOARDING_STEPS,
    currentOnboardingStep,
    hasSeenConfigOnboarding,
    useConfigOnboardingStore,
    type ConfigOnboardingStepId,
} from "@canvas/stores/use-config-onboarding-store";
import { useCanvasSidePanelStore } from "@canvas/stores/use-canvas-side-panel-store";

type SpotlightRect = {
    top: number;
    left: number;
    width: number;
    height: number;
};

const STEP_TARGET: Partial<Record<ConfigOnboardingStepId, string>> = {
    settings: '[data-tour="config-settings-button"]',
    channels: '[data-tour="config-channels-panel"]',
    baseUrl: '[data-tour="config-channel-base-url"]',
    apiKey: '[data-tour="config-channel-api-key"]',
    preferences: '[data-tour="config-preferences-panel"]',
};

const PAD = 10;

function readTargetRect(selector: string | undefined): SpotlightRect | null {
    if (!selector || typeof document === "undefined") return null;
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

function isCanvasProjectPath(pathname: string) {
    // basename=/canvas → /canvas/:id ; some hosts may expose the full /canvas/canvas/:id
    return /^\/canvas\/(?:canvas\/)?[^/]+$/.test(pathname);
}

export function ConfigOnboardingTour() {
    const { t } = useTranslation();
    const { pathname, search } = useLocation();
    const reduceMotion = useReducedMotion();
    const maskId = useId().replace(/:/g, "");
    const active = useConfigOnboardingStore((state) => state.active);
    const stepIndex = useConfigOnboardingStore((state) => state.stepIndex);
    const start = useConfigOnboardingStore((state) => state.start);
    const stop = useConfigOnboardingStore((state) => state.stop);
    const next = useConfigOnboardingStore((state) => state.next);
    const prev = useConfigOnboardingStore((state) => state.prev);
    const setForceTab = useConfigOnboardingStore((state) => state.setForceTab);
    const setForceEditingChannelId = useConfigOnboardingStore((state) => state.setForceEditingChannelId);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const channels = useConfigStore((state) => state.config.channels);
    const openPanel = useCanvasSidePanelStore((state) => state.openPanel);
    const [rect, setRect] = useState<SpotlightRect | null>(null);
    const [ready, setReady] = useState(false);

    const stepId = currentOnboardingStep(stepIndex);
    const total = CONFIG_ONBOARDING_STEPS.length;
    const isProject = isCanvasProjectPath(pathname);
    const forceTour = new URLSearchParams(search).get("configTour") === "1";

    useEffect(() => {
        if (!isProject || active) return;
        if (!forceTour && hasSeenConfigOnboarding()) return;
        if (forceTour) {
            try {
                window.localStorage.removeItem("minimalist-canvas:config-onboarding-v1");
            } catch {
                // ignore
            }
        }
        const timer = window.setTimeout(() => start(), forceTour ? 200 : 900);
        return () => window.clearTimeout(timer);
    }, [active, forceTour, isProject, start]);

    useEffect(() => {
        if (!active) return;

        if (stepId === "welcome") {
            setForceTab(null);
            setForceEditingChannelId(null);
            setConfigDialogOpen(false);
            return;
        }

        if (stepId === "settings") {
            setForceTab(null);
            setForceEditingChannelId(null);
            setConfigDialogOpen(false);
            return;
        }

        if (stepId === "channels") {
            openConfigDialog(false, "channels");
            setForceTab("channels");
            setForceEditingChannelId(null);
            return;
        }

        if (stepId === "baseUrl" || stepId === "apiKey") {
            const channelId = channels[0]?.id || "";
            openConfigDialog(false, "channels");
            setForceTab("channels");
            setForceEditingChannelId(channelId || null);
            return;
        }

        if (stepId === "preferences") {
            openConfigDialog(false, "preferences");
            setForceTab("preferences");
            setForceEditingChannelId(null);
            return;
        }

        if (stepId === "done") {
            setForceEditingChannelId(null);
            setForceTab(null);
        }
    }, [active, channels, openConfigDialog, openPanel, setConfigDialogOpen, setForceEditingChannelId, setForceTab, stepId]);

    useLayoutEffect(() => {
        if (!active) {
            setRect(null);
            setReady(false);
            return;
        }

        let cancelled = false;
        let tries = 0;
        const selector = STEP_TARGET[stepId];

        const measure = () => {
            if (cancelled) return;
            if (!selector) {
                setRect(null);
                setReady(true);
                return;
            }
            const nextRect = readTargetRect(selector);
            if (nextRect) {
                setRect(nextRect);
                setReady(true);
                return;
            }
            tries += 1;
            if (tries < 48) {
                window.setTimeout(measure, 60);
                return;
            }
            setRect(null);
            setReady(true);
        };

        setReady(false);
        const delay =
            stepId === "baseUrl" || stepId === "apiKey"
                ? 280
                : stepId === "settings"
                  ? 0
                  : 140;
        const startTimer = window.setTimeout(measure, delay);
        const onResize = () => {
            const nextRect = readTargetRect(selector);
            setRect(nextRect);
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            cancelled = true;
            window.clearTimeout(startTimer);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, [active, stepId, stepIndex]);

    useEffect(() => {
        if (!active || stepId !== "settings") return;
        const button = document.querySelector('[data-tour="config-settings-button"]');
        if (!button) return;
        const onClick = () => next();
        button.addEventListener("click", onClick);
        return () => button.removeEventListener("click", onClick);
    }, [active, next, stepId]);

    const cardStyle = useMemo(() => {
        const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
        const vh = typeof window === "undefined" ? 800 : window.innerHeight;
        const cardWidth = Math.min(360, vw - 32);

        if (!rect) {
            return {
                top: Math.max(24, vh * 0.28),
                left: Math.max(16, (vw - cardWidth) / 2),
                width: cardWidth,
            };
        }

        const below = rect.top + rect.height + 16;
        const above = rect.top - 16;
        const preferBelow = below + 220 < vh;
        const top = preferBelow ? below : Math.max(16, above - 200);
        let left = rect.left + rect.width / 2 - cardWidth / 2;
        left = Math.min(Math.max(16, left), vw - cardWidth - 16);
        return { top, left, width: cardWidth };
    }, [rect]);

    const finish = () => {
        setConfigDialogOpen(false);
        setForceTab(null);
        setForceEditingChannelId(null);
        stop(true);
    };

    if (!active || typeof document === "undefined") return null;

    const title = t(`config.onboarding.steps.${stepId}.title`);
    const body = t(`config.onboarding.steps.${stepId}.body`);
    const isLast = stepId === "done";
    const progressLabel = t("config.onboarding.progress", { current: stepIndex + 1, total });

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-[11000]" role="dialog" aria-modal="true" aria-label={t("config.onboarding.aria")}>
            <div className="pointer-events-auto absolute inset-0" onClick={(event) => event.stopPropagation()}>
                <svg className="absolute inset-0 h-full w-full" width="100%" height="100%" aria-hidden>
                    <defs>
                        <mask id={maskId}>
                            <rect width="100%" height="100%" fill="white" />
                            {rect ? <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx="12" ry="12" fill="black" /> : null}
                        </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(12, 10, 9, 0.62)" mask={`url(#${maskId})`} />
                </svg>
                {rect ? (
                    <motion.div
                        className="pointer-events-none absolute rounded-xl ring-2 ring-amber-300/90"
                        initial={false}
                        animate={{
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height,
                            boxShadow: "0 0 0 1px rgba(251,191,36,0.35), 0 12px 40px rgba(0,0,0,0.25)",
                        }}
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
                    />
                ) : null}
            </div>

            <AnimatePresence mode="wait">
                {ready ? (
                    <motion.div
                        key={stepId}
                        className="pointer-events-auto absolute z-[11001]"
                        style={cardStyle}
                        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fffaf3] shadow-[0_24px_80px_rgba(28,25,23,0.28)] dark:border-stone-700 dark:bg-stone-950">
                            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400" />
                            <div className="space-y-3 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-medium tracking-[0.14em] text-amber-700 uppercase dark:text-amber-300">{progressLabel}</div>
                                        <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-50">{title}</h2>
                                    </div>
                                    <button type="button" className="text-xs text-stone-500 transition hover:text-stone-800 dark:hover:text-stone-200" onClick={finish}>
                                        {t("config.onboarding.skip")}
                                    </button>
                                </div>
                                <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">{body}</p>
                                <div className="flex items-center justify-between gap-2 pt-1">
                                    <Button size="small" disabled={stepIndex === 0} onClick={prev}>
                                        {t("config.onboarding.back")}
                                    </Button>
                                    <div className="flex gap-2">
                                        {!isLast ? (
                                            <Button type="primary" size="small" onClick={next}>
                                                {t("config.onboarding.next")}
                                            </Button>
                                        ) : (
                                            <Button type="primary" size="small" onClick={finish}>
                                                {t("config.onboarding.finish")}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>,
        document.body,
    );
}
