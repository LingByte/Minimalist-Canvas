import { Button } from "antd";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useConfigStore } from "@canvas/stores/use-config-store";
import {
    CONFIG_ONBOARDING_STEPS,
    CONFIG_ONBOARDING_STORAGE_KEY,
    currentOnboardingStep,
    hasSeenConfigOnboarding,
    useConfigOnboardingStore,
    type ConfigOnboardingStepId,
} from "@canvas/stores/use-config-onboarding-store";

type SpotlightRect = {
    top: number;
    left: number;
    width: number;
    height: number;
};

type CardPlacement = {
    top: number;
    left: number;
    width: number;
    arrow: "top" | "bottom" | "left" | "right" | null;
};

/**
 * Concrete anchors only. Fallbacks are tried in order when the primary
 * node is still mounting (modal / drawer animation).
 */
const STEP_TARGET: Partial<Record<ConfigOnboardingStepId, readonly string[]>> = {
    settings: ['[data-tour="config-settings-button"]'],
    channels: ['[data-tour="config-channel-item"]', '[data-tour="config-channels-panel"]'],
    baseUrl: ['[data-tour="config-channel-base-url"]'],
    apiKey: ['[data-tour="config-channel-api-key"]'],
    preferences: ['[data-tour="config-preferences-panel"]', '[data-tour="config-tab-preferences"]'],
};

/** Modal / drawer form rows: keep the tip under the field, not off to the side. */
const STEP_CARD_BIAS: Partial<Record<ConfigOnboardingStepId, "below">> = {
    channels: "below",
    baseUrl: "below",
    apiKey: "below",
    preferences: "below",
};

const CARD_WIDTH = 340;
const CARD_GAP = 12;
const CARD_FALLBACK_HEIGHT = 196;

function padForTarget(width: number, height: number) {
    if (width <= 48 && height <= 48) return 3;
    if (width >= 280) return 6;
    return 5;
}

function readTargetRect(selectors: readonly string[] | undefined): SpotlightRect | null {
    if (!selectors?.length || typeof document === "undefined") return null;
    for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        // Skip off-screen / zero-opacity mounts during modal enter.
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
        const pad = padForTarget(rect.width, rect.height);
        const top = Math.max(4, rect.top - pad);
        const left = Math.max(4, rect.left - pad);
        const right = Math.min(window.innerWidth - 4, rect.right + pad);
        const bottom = Math.min(window.innerHeight - 4, rect.bottom + pad);
        return {
            top,
            left,
            width: Math.max(8, right - left),
            height: Math.max(8, bottom - top),
        };
    }
    return null;
}

function placeCard(
    rect: SpotlightRect | null,
    cardHeight: number,
    vw: number,
    vh: number,
    bias?: "below",
): CardPlacement {
    const width = Math.min(CARD_WIDTH, vw - 24);
    if (!rect) {
        return {
            top: Math.max(24, (vh - cardHeight) / 2.4),
            left: Math.max(12, (vw - width) / 2),
            width,
            arrow: null,
        };
    }

    const spaceAbove = rect.top - 12;
    const spaceBelow = vh - (rect.top + rect.height) - 12;
    const spaceRight = vw - (rect.left + rect.width) - 12;
    const spaceLeft = rect.left - 12;
    const need = cardHeight + CARD_GAP;
    const wideTarget = rect.width >= 220;
    const preferBelow = bias === "below" || wideTarget;

    const alignLeft = () => Math.min(Math.max(12, rect.left), vw - width - 12);
    const alignCenter = () => Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), vw - width - 12);

    // Wide modal rows / explicit bias: stay under (or above) the target — never the dimmed side gutter.
    if (preferBelow) {
        if (spaceBelow >= need || spaceBelow >= spaceAbove) {
            return {
                top: Math.max(12, Math.min(rect.top + rect.height + CARD_GAP, vh - cardHeight - 12)),
                left: wideTarget ? alignLeft() : alignCenter(),
                width,
                arrow: "top",
            };
        }
        return {
            top: Math.max(12, rect.top - CARD_GAP - cardHeight),
            left: wideTarget ? alignLeft() : alignCenter(),
            width,
            arrow: "bottom",
        };
    }

    if (spaceBelow >= need) {
        return { top: rect.top + rect.height + CARD_GAP, left: alignCenter(), width, arrow: "top" };
    }
    if (spaceAbove >= need && spaceAbove >= spaceBelow) {
        return { top: rect.top - CARD_GAP - cardHeight, left: alignCenter(), width, arrow: "bottom" };
    }
    if (spaceRight >= width + CARD_GAP) {
        const top = Math.min(Math.max(12, rect.top + rect.height / 2 - cardHeight / 2), vh - cardHeight - 12);
        return { top, left: rect.left + rect.width + CARD_GAP, width, arrow: "left" };
    }
    if (spaceLeft >= width + CARD_GAP) {
        const top = Math.min(Math.max(12, rect.top + rect.height / 2 - cardHeight / 2), vh - cardHeight - 12);
        return { top, left: rect.left - CARD_GAP - width, width, arrow: "right" };
    }

    return {
        top: Math.max(12, Math.min(rect.top + rect.height + CARD_GAP, vh - cardHeight - 12)),
        left: alignLeft(),
        width,
        arrow: spaceBelow > 24 ? "top" : null,
    };
}

/** Console chrome with tools sidebar or a canvas project — not marketing landing. */
function isConsolePath(pathname: string) {
    if (pathname === "/" || pathname === "/home" || pathname === "/changelog") return false;
    if (/^\/canvas(?:\/|$)/.test(pathname)) return true;
    const slug = pathname.split("/").filter(Boolean)[0];
    return Boolean(slug);
}

export function ConfigOnboardingTour() {
    const { t } = useTranslation();
    const { pathname, search } = useLocation();
    const reduceMotion = useReducedMotion();
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
    const [rect, setRect] = useState<SpotlightRect | null>(null);
    const [ready, setReady] = useState(false);
    const [cardHeight, setCardHeight] = useState(CARD_FALLBACK_HEIGHT);
    const cardRef = useRef<HTMLDivElement>(null);

    const stepId = currentOnboardingStep(stepIndex);
    const total = CONFIG_ONBOARDING_STEPS.length;
    const inConsole = isConsolePath(pathname);
    const forceTour = new URLSearchParams(search).get("configTour") === "1";

    useEffect(() => {
        if (!inConsole || active) return;
        if (!forceTour && hasSeenConfigOnboarding()) return;
        if (forceTour) {
            try {
                window.localStorage.removeItem(CONFIG_ONBOARDING_STORAGE_KEY);
            } catch {
                // ignore
            }
        }
        const timer = window.setTimeout(() => start(), forceTour ? 200 : 900);
        return () => window.clearTimeout(timer);
    }, [active, forceTour, inConsole, start]);

    useEffect(() => {
        if (!active) return;

        if (stepId === "welcome" || stepId === "settings") {
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
    }, [active, channels, openConfigDialog, setConfigDialogOpen, setForceEditingChannelId, setForceTab, stepId]);

    useLayoutEffect(() => {
        if (!active) {
            setRect(null);
            setReady(false);
            return;
        }

        let cancelled = false;
        let tries = 0;
        const selectors = STEP_TARGET[stepId];

        const measure = () => {
            if (cancelled) return;
            if (!selectors?.length) {
                setRect(null);
                setReady(true);
                return;
            }
            for (const selector of selectors) {
                const el = document.querySelector(selector) as HTMLElement | null;
                if (el) {
                    el.scrollIntoView({ block: "nearest", inline: "nearest" });
                    break;
                }
            }
            const nextRect = readTargetRect(selectors);
            if (nextRect) {
                setRect(nextRect);
                setReady(true);
                return;
            }
            tries += 1;
            if (tries < 60) {
                window.setTimeout(measure, 50);
                return;
            }
            setRect(null);
            setReady(true);
        };

        setReady(false);
        const delay =
            stepId === "baseUrl" || stepId === "apiKey"
                ? 420
                : stepId === "channels" || stepId === "preferences"
                  ? 280
                  : stepId === "settings"
                    ? 40
                    : 80;
        const startTimer = window.setTimeout(measure, delay);
        const onResize = () => setRect(readTargetRect(selectors));
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            cancelled = true;
            window.clearTimeout(startTimer);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, [active, stepId, stepIndex]);

    useLayoutEffect(() => {
        if (!ready || !cardRef.current) return;
        const node = cardRef.current;
        const apply = () => {
            const height = Math.ceil(node.getBoundingClientRect().height);
            if (height > 0) setCardHeight(height);
        };
        apply();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
        observer?.observe(node);
        return () => observer?.disconnect();
    }, [ready, stepId]);

    useEffect(() => {
        if (!active || stepId !== "settings") return;
        const button = document.querySelector('[data-tour="config-settings-button"]');
        if (!button) return;
        const onClick = () => next();
        button.addEventListener("click", onClick);
        return () => button.removeEventListener("click", onClick);
    }, [active, next, stepId]);

    const placement = useMemo(() => {
        const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
        const vh = typeof window === "undefined" ? 800 : window.innerHeight;
        return placeCard(rect, cardHeight, vw, vh, STEP_CARD_BIAS[stepId]);
    }, [rect, cardHeight, stepId]);

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
    const radius = rect && rect.width <= 48 ? 10 : 12;

    return createPortal(
        <div className="pointer-events-none fixed inset-0 z-[11000]" role="dialog" aria-modal="true" aria-label={t("config.onboarding.aria")}>
            {/* Four panels leave a real clickable hole over the target. */}
            {rect ? (
                <>
                    <div className="pointer-events-auto absolute inset-x-0 top-0 bg-stone-950/50" style={{ height: Math.max(0, rect.top) }} />
                    <div
                        className="pointer-events-auto absolute left-0 bg-stone-950/50"
                        style={{ top: rect.top, height: rect.height, width: Math.max(0, rect.left) }}
                    />
                    <div
                        className="pointer-events-auto absolute right-0 bg-stone-950/50"
                        style={{
                            top: rect.top,
                            height: rect.height,
                            width: Math.max(0, window.innerWidth - rect.left - rect.width),
                        }}
                    />
                    <div
                        className="pointer-events-auto absolute inset-x-0 bottom-0 bg-stone-950/50"
                        style={{ height: Math.max(0, window.innerHeight - rect.top - rect.height) }}
                    />
                    <motion.div
                        className="pointer-events-none absolute z-[1] border border-white/80 dark:border-white/35"
                        style={{ borderRadius: radius }}
                        initial={false}
                        animate={{
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height,
                            boxShadow: "0 0 0 1px rgba(28,25,23,0.2), 0 6px 20px rgba(0,0,0,0.2)",
                        }}
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                    />
                </>
            ) : (
                <div className="pointer-events-auto absolute inset-0 bg-stone-950/45" />
            )}

            <AnimatePresence mode="wait">
                {ready ? (
                    <motion.div
                        key={stepId}
                        ref={cardRef}
                        className="pointer-events-auto absolute z-[11001]"
                        style={{ top: placement.top, left: placement.left, width: placement.width }}
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="relative rounded-xl border border-stone-200/90 bg-white shadow-[0_12px_40px_rgba(28,25,23,0.14)] dark:border-stone-700/90 dark:bg-stone-900 dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                            {placement.arrow && rect ? (
                                <span
                                    aria-hidden
                                    className={
                                        placement.arrow === "bottom"
                                            ? "absolute top-full -mt-px border-x-8 border-t-8 border-x-transparent border-t-white dark:border-t-stone-900"
                                            : placement.arrow === "top"
                                              ? "absolute bottom-full -mb-px border-x-8 border-b-8 border-x-transparent border-b-white dark:border-b-stone-900"
                                              : placement.arrow === "left"
                                                ? "absolute right-full -mr-px border-y-8 border-r-8 border-y-transparent border-r-white dark:border-r-stone-900"
                                                : "absolute left-full -ml-px border-y-8 border-l-8 border-y-transparent border-l-white dark:border-l-stone-900"
                                    }
                                    style={
                                        placement.arrow === "top" || placement.arrow === "bottom"
                                            ? {
                                                  left: Math.min(
                                                      Math.max(16, rect.left + rect.width / 2 - placement.left),
                                                      placement.width - 16,
                                                  ),
                                                  transform: "translateX(-50%)",
                                              }
                                            : {
                                                  top: Math.min(
                                                      Math.max(16, rect.top + rect.height / 2 - placement.top),
                                                      Math.max(16, cardHeight - 16),
                                                  ),
                                                  transform: "translateY(-50%)",
                                              }
                                    }
                                />
                            ) : null}
                            <div className="space-y-3.5 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-medium tabular-nums tracking-wide text-stone-400 dark:text-stone-500">{progressLabel}</div>
                                        <h2 className="mt-2.5 text-[15px] font-semibold leading-snug tracking-tight text-stone-950 dark:text-stone-50">{title}</h2>
                                    </div>
                                    <button
                                        type="button"
                                        className="shrink-0 text-xs text-stone-400 transition hover:text-stone-700 dark:hover:text-stone-200"
                                        onClick={finish}
                                    >
                                        {t("config.onboarding.skip")}
                                    </button>
                                </div>
                                <p className="text-[13px] leading-6 text-stone-600 dark:text-stone-300">{body}</p>
                                <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3.5 dark:border-stone-800">
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
