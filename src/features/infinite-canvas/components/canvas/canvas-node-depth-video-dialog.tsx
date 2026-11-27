import { useEffect, useMemo, useState } from "react";
import { Button, Drawer } from "antd";
import { Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@canvas/components/model-picker";
import { CanvasModelPriceHint } from "@canvas/components/canvas/canvas-model-price-hint";
import { DEPTH_VIDEO_PROMPT } from "@canvas/lib/canvas/canvas-depth-video";
import { resolveModelForCapability, useEffectiveConfig } from "@canvas/stores/use-config-store";

export type CanvasDepthVideoConfirm = {
    model: string;
    prompt: string;
};

export function CanvasNodeDepthVideoDialog({
    previewUrl,
    mediaKind = "image",
    open,
    onClose,
    onConfirm,
    confirming = false,
}: {
    previewUrl: string;
    mediaKind?: "image" | "video";
    open: boolean;
    onClose: () => void;
    onConfirm: (payload: CanvasDepthVideoConfirm) => void;
    confirming?: boolean;
}) {
    const { t } = useTranslation();
    const effectiveConfig = useEffectiveConfig();
    const [model, setModel] = useState("");

    useEffect(() => {
        if (!open) return;
        setModel(resolveModelForCapability(effectiveConfig, undefined, "video"));
    }, [effectiveConfig, open, previewUrl]);

    const config = useMemo(
        () => ({
            ...effectiveConfig,
            model,
            videoModel: model,
        }),
        [effectiveConfig, model],
    );

    return (
        <Drawer
            title={null}
            open={open && Boolean(previewUrl)}
            onClose={onClose}
            footer={null}
            placement="right" width="min(480px, 100vw)"
           
            destroyOnHidden
        >
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">{t("canvas.editors.depthVideoTitle")}</h2>
                    <p className="mt-1 text-sm opacity-60">{t("canvas.editors.depthVideoDescription")}</p>
                </div>
                <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                    <div className="grid place-items-center rounded-xl border p-4">
                        {mediaKind === "video" ? (
                            <video src={previewUrl} className="max-h-56 w-full rounded-xl object-contain" muted playsInline controls />
                        ) : (
                            <img src={previewUrl} alt="" className="max-h-56 w-full rounded-xl object-contain" draggable={false} />
                        )}
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="text-sm font-medium opacity-75">{t("canvas.editors.depthVideoModel")}</div>
                            <ModelPicker
                                config={config}
                                value={model}
                                onChange={setModel}
                                capability="video"
                                fullWidth
                            />
                            <CanvasModelPriceHint modelValue={model} className="text-xs tabular-nums opacity-70" />
                        </div>
                        <p className="rounded-lg border bg-black/[0.02] p-3 text-xs leading-5 opacity-70 dark:bg-white/[0.04]">
                            {DEPTH_VIDEO_PROMPT}
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{t("canvas.editors.cancel")}</Button>
                    <Button
                        type="primary"
                        size="large"
                        loading={confirming}
                        icon={<Clapperboard className="size-4" />}
                        disabled={!model.trim()}
                        onClick={() =>
                            onConfirm({
                                model: model.trim(),
                                prompt: DEPTH_VIDEO_PROMPT,
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
