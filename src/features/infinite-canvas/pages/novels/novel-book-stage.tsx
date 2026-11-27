import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

import { cn } from "@canvas/lib/utils";

export type NovelFlipDirection = "next" | "prev";

export type NovelBookPagePayload = {
    key: string;
    title: string;
    showTitle: boolean;
    body: string;
    footerLeft: string;
    footerRight: string;
};

type NovelBookStageProps = {
    page: NovelBookPagePayload;
    flipDirection: NovelFlipDirection;
    canPrev: boolean;
    canNext: boolean;
    busy?: boolean;
    prevLabel: string;
    nextLabel: string;
    onPrev: () => void;
    onNext: () => void;
    onFlipChange?: (flipping: boolean) => void;
};

function PaperFace({
    title,
    showTitle,
    body,
    footerLeft,
    footerRight,
    tone = "front",
    scrollKey,
}: NovelBookPagePayload & { tone?: "front" | "back"; scrollKey?: string }) {
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollTop = 0;
    }, [scrollKey, body]);

    return (
        <div
            className={cn(
                "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border shadow-[0_18px_40px_rgba(60,40,20,0.16)]",
                tone === "front"
                    ? "border-[#d9cbb5] bg-[#f7f1e6] text-stone-800 dark:border-stone-700 dark:bg-[#1a1612] dark:text-stone-200"
                    : "border-[#cfc0a8] bg-[#ebe2d2] text-stone-500 dark:border-stone-700 dark:bg-[#221c16] dark:text-stone-400",
            )}
        >
            <div
                className={cn(
                    "pointer-events-none absolute inset-y-0 w-10",
                    tone === "front"
                        ? "left-0 bg-[linear-gradient(90deg,rgba(80,55,25,0.14),transparent)]"
                        : "right-0 bg-[linear-gradient(270deg,rgba(80,55,25,0.18),transparent)]",
                )}
            />
            <div className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:radial-gradient(rgba(90,70,40,0.08)_0.7px,transparent_0.7px)] [background-size:3px_3px] dark:opacity-20" />
            <div
                ref={scrollRef}
                data-novel-page-scroll={tone === "front" ? "true" : undefined}
                className={cn(
                    "relative min-h-0 flex-1 px-8 py-7 sm:px-12",
                    tone === "front" ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
                )}
            >
                {showTitle ? (
                    <h2 className="mb-5 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">{title}</h2>
                ) : null}
                <div className="whitespace-pre-wrap text-[15px] leading-8">{body}</div>
            </div>
            <div className="relative flex shrink-0 items-center justify-between border-t border-[#e4d8c6] px-5 py-2.5 text-[11px] text-stone-500 dark:border-stone-800">
                <span className="truncate pr-3">{footerLeft}</span>
                <span className="shrink-0 tabular-nums">{footerRight}</span>
            </div>
        </div>
    );
}

function FlippingLeaf({
    from,
    direction,
    onDone,
}: {
    from: NovelBookPagePayload;
    direction: NovelFlipDirection;
    onDone: () => void;
}) {
    const rotateY = useMotionValue(0);
    const progress = useTransform(rotateY, (value) => Math.min(1, Math.abs(value) / 180));
    const shade = useTransform(progress, [0, 0.45, 1], [0.04, 0.48, 0.08]);
    const sheetShadow = useTransform(
        progress,
        [0, 0.5, 1],
        [
            "0 10px 24px rgba(40,28,12,0.12)",
            "0 28px 48px rgba(40,28,12,0.28)",
            "0 10px 24px rgba(40,28,12,0.08)",
        ],
    );
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;
    const origin = direction === "next" ? "left center" : "right center";
    const target = direction === "next" ? -180 : 180;

    useEffect(() => {
        const controls = animate(rotateY, target, {
            duration: 0.82,
            ease: [0.4, 0.02, 0.2, 1],
            onComplete: () => onDoneRef.current(),
        });
        return () => controls.stop();
    }, [rotateY, target]);

    return (
        <motion.div
            className="absolute inset-0 z-20"
            style={{
                rotateY,
                transformOrigin: origin,
                transformStyle: "preserve-3d",
                boxShadow: sheetShadow,
            }}
        >
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
                <PaperFace {...from} tone="front" />
                <motion.div
                    className="pointer-events-none absolute inset-0 rounded-[18px]"
                    style={{
                        opacity: shade,
                        background:
                            direction === "next"
                                ? "linear-gradient(90deg, rgba(30,20,8,0.34), rgba(30,20,8,0.02) 46%, rgba(30,20,8,0.2))"
                                : "linear-gradient(270deg, rgba(30,20,8,0.34), rgba(30,20,8,0.02) 46%, rgba(30,20,8,0.2))",
                    }}
                />
            </div>
            <div
                className="absolute inset-0"
                style={{
                    transform: "rotateY(180deg)",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                }}
            >
                <PaperFace {...from} tone="back" body="" showTitle={false} />
                <div
                    className="pointer-events-none absolute inset-0 rounded-[18px]"
                    style={{
                        background:
                            direction === "next"
                                ? "linear-gradient(270deg, rgba(70,50,25,0.26), transparent 58%)"
                                : "linear-gradient(90deg, rgba(70,50,25,0.26), transparent 58%)",
                    }}
                />
            </div>
        </motion.div>
    );
}

export function NovelBookStage({
    page,
    flipDirection,
    canPrev,
    canNext,
    busy,
    prevLabel,
    nextLabel,
    onPrev,
    onNext,
    onFlipChange,
}: NovelBookStageProps) {
    const reduceMotion = useReducedMotion();
    const [visible, setVisible] = useState(page);
    const [flip, setFlip] = useState<{ from: NovelBookPagePayload; direction: NovelFlipDirection } | null>(null);
    const lastKeyRef = useRef(page.key);
    const visibleRef = useRef(page);
    const pageRef = useRef(page);
    pageRef.current = page;

    const clearFlip = useCallback(() => setFlip(null), []);

    useEffect(() => {
        onFlipChange?.(Boolean(flip));
    }, [flip, onFlipChange]);

    useEffect(() => {
        if (page.key === lastKeyRef.current) {
            visibleRef.current = pageRef.current;
            setVisible(pageRef.current);
            return;
        }
        const previous = visibleRef.current;
        const nextPage = pageRef.current;
        lastKeyRef.current = nextPage.key;
        visibleRef.current = nextPage;
        if (reduceMotion) {
            setVisible(nextPage);
            setFlip(null);
            return;
        }
        setFlip({ from: previous, direction: flipDirection });
        setVisible(nextPage);
    }, [page.key, flipDirection, reduceMotion]);

    const locked = Boolean(busy || flip);

    return (
        <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col" style={{ perspective: "1800px" }}>
            <div className="pointer-events-none absolute inset-x-8 -bottom-1 h-7 rounded-[50%] bg-stone-900/15 blur-md dark:bg-black/45" />
            <div className={cn("relative flex min-h-0 flex-1 flex-col", busy && "opacity-70")} style={{ transformStyle: "preserve-3d" }}>
                <div className="absolute inset-0 z-0">
                    <PaperFace {...visible} scrollKey={visible.key} />
                    {flip ? (
                        <div
                            className="pointer-events-none absolute inset-0 rounded-[18px]"
                            style={{
                                background:
                                    flip.direction === "next"
                                        ? "linear-gradient(90deg, rgba(40,28,12,0.18), transparent 40%)"
                                        : "linear-gradient(270deg, rgba(40,28,12,0.18), transparent 40%)",
                            }}
                        />
                    ) : null}
                </div>
                {flip ? <FlippingLeaf from={flip.from} direction={flip.direction} onDone={clearFlip} /> : null}
                <button
                    type="button"
                    aria-label={prevLabel}
                    className="absolute inset-y-8 left-0 z-30 w-10 cursor-w-resize bg-transparent disabled:cursor-default sm:w-12"
                    disabled={!canPrev || locked}
                    onClick={onPrev}
                />
                <button
                    type="button"
                    aria-label={nextLabel}
                    className="absolute inset-y-8 right-0 z-30 w-10 cursor-e-resize bg-transparent disabled:cursor-default sm:w-12"
                    disabled={!canNext || locked}
                    onClick={onNext}
                />
            </div>
        </div>
    );
}
