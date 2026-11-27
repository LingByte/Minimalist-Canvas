import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Segmented } from "antd";
import { WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@canvas/components/model-picker";
import { CanvasModelPriceHint } from "@canvas/components/canvas/canvas-model-price-hint";
import {
    getPortraitStylePreset,
    type PortraitStyleId,
} from "@canvas/lib/canvas/canvas-portrait-style";
import { resolveModelForCapability, useEffectiveConfig } from "@canvas/stores/use-config-store";

export type CanvasPortraitStyleConfirm = {
    style: PortraitStyleId;
    model: string;
    prompt: string;
};

export function CanvasNodePortraitStyleDialog({
    dataUrl,
    open,
    onClose,
    onConfirm,
    confirming = false,
}: {
    dataUrl: string;
    open: boolean;
    onClose: () => void;
    onConfirm: (payload: CanvasPortraitStyleConfirm) => void;
    confirming?: boolean;
}) {
    const { t } = useTranslation();
    const effectiveConfig = useEffectiveConfig();
    const [style, setStyle] = useState<PortraitStyleId>("pencil");
    const [model, setModel] = useState("");

    useEffect(() => {
        if (!open) return;
        setStyle("pencil");
        setModel(resolveModelForCapability(effectiveConfig, undefined, "image"));
    }, [dataUrl, effectiveConfig, open]);

    const preset = useMemo(() => getPortraitStylePreset(style), [style]);
    const config = useMemo(
        () => ({
            ...effectiveConfig,
            model,
            imageModel: model,
        }),
        [effectiveConfig, model],
    );

    return (
        <Drawer
            title={null}
            open={open && Boolean(dataUrl)}
            onClose={onClose}
            footer={null}
            placement="right" width="min(480px, 100vw)"
           
            destroyOnHidden
        >
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">{t("canvas.editors.portraitStyleTitle")}</h2>
                    <p className="mt-1 text-sm opacity-60">{t("canvas.editors.portraitStyleDescription")}</p>
                </div>
                <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                    <div className="grid place-items-center rounded-xl border p-4">
                        <img src={dataUrl} alt="" className="max-h-56 w-full rounded-xl object-contain" draggable={false} />
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.editors.portraitStylePreset")}</div>
                            <Segmented
                                block
                                value={style}
                                onChange={(value) => setStyle(value as PortraitStyleId)}
                                options={[
                                    { label: t("canvas.editors.portraitStyle_pencil"), value: "pencil" },
                                    { label: t("canvas.editors.portraitStyle_watercolor"), value: "watercolor" },
                                    { label: t("canvas.editors.portraitStyle_retouch"), value: "retouch" },
                                ]}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.editors.portraitStyleModel")}</div>
                            <ModelPicker
                                config={config}
                                value={model}
                                onChange={setModel}
                                capability="image"
                                fullWidth
                            />
                            <CanvasModelPriceHint modelValue={model} className="text-xs tabular-nums opacity-70" />
                        </div>
                        <p className="rounded-lg border bg-black/[0.02] p-3 text-xs leading-5 opacity-70 dark:bg-white/[0.04]">
                            {preset.prompt}
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{t("canvas.editors.cancel")}</Button>
                    <Button
                        type="primary"
                        size="large"
                        loading={confirming}
                        icon={<WandSparkles className="size-4" />}
                        disabled={!model.trim()}
                        onClick={() =>
                            onConfirm({
                                style,
                                model: model.trim(),
                                prompt: preset.prompt,
                            })
                        }
                    >
                        {t("canvas.editors.aiGenerate")}
                    </Button>
                </div>
            </div>
        </Drawer>
    );
}
