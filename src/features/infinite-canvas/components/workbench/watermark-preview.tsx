import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { applyImageWatermark } from "@canvas/lib/watermark/apply-image-watermark";
import { buildWatermarkApplyInput, isWatermarkReady, useWatermarkStore } from "@canvas/stores/use-watermark-store";
import { cn } from "@/lib/utils";

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 480;

function buildSampleBackground(): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.reject(new Error("Canvas 2D unavailable"));

    const sky = ctx.createLinearGradient(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    sky.addColorStop(0, "#c8d6e5");
    sky.addColorStop(0.45, "#dfe6ee");
    sky.addColorStop(1, "#b8c4b0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    ctx.fillStyle = "rgba(120, 90, 60, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, PREVIEW_HEIGHT * 0.72);
    ctx.quadraticCurveTo(PREVIEW_WIDTH * 0.35, PREVIEW_HEIGHT * 0.58, PREVIEW_WIDTH, PREVIEW_HEIGHT * 0.78);
    ctx.lineTo(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    ctx.lineTo(0, PREVIEW_HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    for (const [x, y, r] of [
        [120, 110, 28],
        [280, 70, 18],
        [460, 130, 34],
        [540, 80, 14],
    ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = "rgba(40, 50, 60, 0.18)";
    ctx.fillRect(PREVIEW_WIDTH * 0.12, PREVIEW_HEIGHT * 0.42, PREVIEW_WIDTH * 0.28, PREVIEW_HEIGHT * 0.28);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Preview encode failed"))), "image/png");
    });
}

/** Live sample showing how the export watermark will look on an image. */
export function WatermarkPreview(props: { className?: string }) {
    const { t } = useTranslation();
    const enabled = useWatermarkStore((state) => state.enabled);
    const text = useWatermarkStore((state) => state.text);
    const logoMode = useWatermarkStore((state) => state.logoMode);
    const logoDataUrl = useWatermarkStore((state) => state.logoDataUrl);
    const template = useWatermarkStore((state) => state.template);
    const effect = useWatermarkStore((state) => state.effect);
    const placement = useWatermarkStore((state) => state.placement);
    const opacity = useWatermarkStore((state) => state.opacity);
    const rotate = useWatermarkStore((state) => state.rotate);
    const fontId = useWatermarkStore((state) => state.fontId);
    const fontSize = useWatermarkStore((state) => state.fontSize);
    const [previewUrl, setPreviewUrl] = useState("");

    useEffect(() => {
        let cancelled = false;

        const timer = window.setTimeout(() => {
            void (async () => {
                try {
                    const sample = await buildSampleBackground();
                    const state = useWatermarkStore.getState();
                    const result = isWatermarkReady(state)
                        ? await applyImageWatermark(sample, buildWatermarkApplyInput(state, { fontSizeScale: 0.55 }))
                        : sample;
                    const nextUrl = URL.createObjectURL(result);
                    if (cancelled) {
                        URL.revokeObjectURL(nextUrl);
                        return;
                    }
                    setPreviewUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return nextUrl;
                    });
                } catch {
                    if (!cancelled) {
                        setPreviewUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return "";
                        });
                    }
                }
            })();
        }, 120);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [enabled, text, logoMode, logoDataUrl, template, effect, placement, opacity, rotate, fontId, fontSize]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only revoke on unmount
    }, []);

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", props.className)}>
            <div className="text-[11px] font-medium text-stone-500">{t("watermark.preview")}</div>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-900">
                {previewUrl ? (
                    <img src={previewUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                    <div className="aspect-[4/3] w-full animate-pulse bg-stone-200/80 dark:bg-stone-800" />
                )}
            </div>
        </div>
    );
}
