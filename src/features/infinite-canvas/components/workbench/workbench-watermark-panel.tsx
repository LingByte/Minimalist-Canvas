import { App, Button, Input, InputNumber, Select, Slider, Switch, Upload } from "antd";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WatermarkPreview } from "@canvas/components/workbench/watermark-preview";
import { compressImageBlob } from "@canvas/lib/image-compress";
import {
    resolveWatermarkFontFamily,
    WATERMARK_DEFAULT_FONT_SIZE,
    WATERMARK_EFFECT_OPTIONS,
    WATERMARK_FONT_OPTIONS,
    WATERMARK_PRODUCT_LOGO,
    WATERMARK_TEMPLATE_OPTIONS,
    type WatermarkEffectId,
    type WatermarkFontId,
    type WatermarkPlacement,
    type WatermarkTemplateId,
} from "@canvas/lib/watermark/apply-image-watermark";
import { resolveWatermarkLogoUrl, useWatermarkStore } from "@canvas/stores/use-watermark-store";
import { cn } from "@/lib/utils";

const PLACEMENTS: WatermarkPlacement[] = [
    "top-start",
    "top",
    "top-end",
    "left",
    "middle",
    "right",
    "bottom-start",
    "bottom",
    "bottom-end",
];

const LOGO_SOFT_LIMIT = 280 * 1024;

async function fileToDataUrl(file: Blob): Promise<string> {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("read failed"));
        };
        reader.onerror = () => reject(reader.error || new Error("read failed"));
        reader.readAsDataURL(file);
    });
}

/** Watermark controls — used in app settings (and any embedded surface). */
export function WorkbenchWatermarkPanel(props: { className?: string; compact?: boolean }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const enabled = useWatermarkStore((state) => state.enabled);
    const text = useWatermarkStore((state) => state.text);
    const logoMode = useWatermarkStore((state) => state.logoMode);
    const logoDataUrl = useWatermarkStore((state) => state.logoDataUrl);
    const template = useWatermarkStore((state) => state.template);
    const effect = useWatermarkStore((state) => state.effect ?? "classic");
    const placement = useWatermarkStore((state) => state.placement);
    const opacity = useWatermarkStore((state) => state.opacity);
    const rotate = useWatermarkStore((state) => state.rotate);
    const fontId = useWatermarkStore((state) => state.fontId);
    const fontSize = useWatermarkStore((state) => state.fontSize);
    const setEnabled = useWatermarkStore((state) => state.setEnabled);
    const setText = useWatermarkStore((state) => state.setText);
    const setLogoMode = useWatermarkStore((state) => state.setLogoMode);
    const setLogoDataUrl = useWatermarkStore((state) => state.setLogoDataUrl);
    const setTemplate = useWatermarkStore((state) => state.setTemplate);
    const setEffect = useWatermarkStore((state) => state.setEffect);
    const setPlacement = useWatermarkStore((state) => state.setPlacement);
    const setOpacity = useWatermarkStore((state) => state.setOpacity);
    const setRotate = useWatermarkStore((state) => state.setRotate);
    const setFontId = useWatermarkStore((state) => state.setFontId);
    const setFontSize = useWatermarkStore((state) => state.setFontSize);

    const previewLogo = useWatermarkStore((state) => resolveWatermarkLogoUrl(state));
    const showTextControls = template !== "logo";

    const ingestLogo = async (file: File) => {
        try {
            let blob: Blob = file;
            if (file.size > LOGO_SOFT_LIMIT) {
                message.loading({ content: t("watermark.logoCompressing"), key: "wm-logo", duration: 0 });
                blob = await compressImageBlob(file, {
                    maxSizeMB: 0.22,
                    maxWidthOrHeight: 512,
                    quality: 0.82,
                });
                message.success({ content: t("watermark.logoCompressed"), key: "wm-logo" });
            }
            const dataUrl = await fileToDataUrl(blob);
            setLogoDataUrl(dataUrl);
        } catch {
            message.error({ content: t("watermark.logoLoadFailed"), key: "wm-logo" });
        }
    };

    const controls = (
        <>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold tracking-tight text-stone-800 dark:text-stone-100">{t("watermark.title")}</div>
                </div>
                <Switch checked={enabled} onChange={setEnabled} aria-label={t("watermark.enabled")} />
            </div>

            <div className={cn("mt-3 space-y-2.5", !enabled && "pointer-events-none opacity-45")}>
                <div>
                    <span className="mb-1.5 block text-[11px] font-medium text-stone-500">{t("watermark.effect")}</span>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {WATERMARK_EFFECT_OPTIONS.map((item) => {
                            const active = effect === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={cn(
                                        "rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition",
                                        active
                                            ? "border-stone-900/15 bg-stone-900/[0.08] text-stone-950 dark:border-white/20 dark:bg-white/[0.12] dark:text-stone-50"
                                            : "border-stone-200 bg-transparent text-stone-600 hover:border-stone-300 hover:bg-stone-100/70 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-white/[0.05] dark:hover:text-stone-200",
                                    )}
                                    onClick={() => setEffect(item.id as WatermarkEffectId)}
                                >
                                    {t(item.labelKey)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {showTextControls ? (
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-stone-500">{t("watermark.text")}</span>
                        <Input
                            value={text}
                            maxLength={48}
                            placeholder={t("watermark.textPlaceholder")}
                            onChange={(event) => setText(event.target.value)}
                            style={{ fontFamily: resolveWatermarkFontFamily(fontId) }}
                        />
                    </label>
                ) : null}

                {showTextControls ? (
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">{t("watermark.font")}</span>
                            <Select
                                className="w-full"
                                value={fontId}
                                options={WATERMARK_FONT_OPTIONS.map((item) => ({
                                    value: item.id,
                                    label: <span style={{ fontFamily: item.family }}>{t(item.labelKey)}</span>,
                                }))}
                                onChange={(value: WatermarkFontId) => setFontId(value)}
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-stone-500">{t("watermark.fontSize")}</span>
                            <InputNumber
                                className="w-full"
                                min={8}
                                max={200}
                                step={1}
                                value={fontSize || WATERMARK_DEFAULT_FONT_SIZE}
                                onChange={(value) => setFontSize(typeof value === "number" ? value : WATERMARK_DEFAULT_FONT_SIZE)}
                            />
                        </label>
                    </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-stone-500">{t("watermark.layout")}</span>
                        <Select
                            className="w-full"
                            value={template}
                            options={WATERMARK_TEMPLATE_OPTIONS.map((item) => ({
                                value: item.id,
                                label: t(item.labelKey),
                            }))}
                            onChange={(value: WatermarkTemplateId) => setTemplate(value)}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-stone-500">{t("watermark.placement")}</span>
                        <Select
                            className="w-full"
                            value={placement}
                            options={PLACEMENTS.map((value) => ({ value, label: t(`watermark.placements.${value}`) }))}
                            onChange={(value: WatermarkPlacement) => setPlacement(value)}
                        />
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-stone-500">
                            {t("watermark.opacity")} · {Math.round(opacity * 100)}%
                        </span>
                        <Slider
                            min={5}
                            max={100}
                            step={1}
                            value={Math.round(opacity * 100)}
                            onChange={(value) => setOpacity(value / 100)}
                            tooltip={{ formatter: (value) => `${value ?? 0}%` }}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-stone-500">{t("watermark.rotate")}</span>
                        <InputNumber
                            className="w-full"
                            min={-45}
                            max={45}
                            step={1}
                            value={rotate}
                            onChange={(value) => typeof value === "number" && setRotate(value)}
                        />
                    </label>
                </div>

                {template !== "text" ? (
                    <div className="space-y-2">
                        <span className="block text-[11px] font-medium text-stone-500">{t("watermark.logo")}</span>
                        <div className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 dark:border-stone-700 dark:bg-stone-950">
                            {logoMode === "off" ? (
                                <span className="min-w-0 flex-1 truncate text-[11px] text-stone-400">{t("watermark.logoOff")}</span>
                            ) : (
                                <>
                                    <img
                                        src={logoMode === "custom" && logoDataUrl ? logoDataUrl : previewLogo || WATERMARK_PRODUCT_LOGO}
                                        alt=""
                                        className="size-7 rounded object-contain"
                                    />
                                    <span className="min-w-0 flex-1 truncate text-[11px] text-stone-500">
                                        {logoMode === "custom" ? t("watermark.logoCustom") : t("watermark.logoProduct")}
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setLogoMode("product")}>
                                {t("watermark.useProductLogo")}
                            </Button>
                            <Upload
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                showUploadList={false}
                                beforeUpload={(file) => {
                                    void ingestLogo(file);
                                    return false;
                                }}
                            >
                                <Button size="small" icon={<ImagePlus className="size-3.5" />}>
                                    {t("watermark.uploadLogo")}
                                </Button>
                            </Upload>
                            <Button
                                size="small"
                                icon={<Trash2 className="size-3.5" />}
                                onClick={() => setLogoMode("off")}
                                disabled={logoMode === "off"}
                            >
                                {t("watermark.clearLogo")}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );

    if (props.compact) {
        return (
            <div className={cn("rounded-xl border border-stone-200/90 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50", props.className)}>
                {controls}
            </div>
        );
    }

    return (
        <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.95fr)] lg:items-start", props.className)}>
            <div className="min-w-0">{controls}</div>
            <WatermarkPreview className="lg:sticky lg:top-0" />
        </div>
    );
}
