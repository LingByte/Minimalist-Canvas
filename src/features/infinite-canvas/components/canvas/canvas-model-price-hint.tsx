import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { QUOTA_TYPE_VALUES } from "@/features/pricing/constants";
import { usePricingData } from "@/features/pricing/hooks/use-pricing-data";
import { isPerSecondModel } from "@/features/pricing/lib/model-helpers";
import { formatPrice, formatRequestPrice } from "@/features/pricing/lib/price";
import {
    estimateGenerationQuota,
} from "@canvas/lib/generation-quota-confirm";
import { modelOptionName } from "@canvas/stores/use-config-store";

type CanvasModelPriceHintProps = {
    modelValue: string;
    /** Video output resolution (e.g. 720p); scales per-second model unit price. */
    resolution?: string;
    className?: string;
};

/** Compact selected-model price next to canvas generate controls. */
export function CanvasModelPriceHint({ modelValue, resolution, className }: CanvasModelPriceHintProps) {
    const { t } = useTranslation();
    const { models, priceRate, usdExchangeRate } = usePricingData();
    const modelName = modelOptionName(modelValue || "").trim();

    const label = useMemo(() => {
        if (!modelName || models.length === 0) return "";
        const model = models.find((item) => item.model_name === modelName);
        if (!model) return "";
        if (isPerSecondModel(model)) {
            const estimate = estimateGenerationQuota({
                modelValue,
                mode: "video",
                resolution,
                seconds: 1,
                models,
                priceRate,
                usdExchangeRate,
            });
            if (!estimate.unitPriceLabel) return "";
            return t("canvas.promptPanel.pricePerSecond", { price: estimate.unitPriceLabel });
        }
        if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
            const price = formatRequestPrice(model, false, priceRate, usdExchangeRate);
            if (!price || price === "-") return "";
            return t("canvas.promptPanel.pricePerRequest", { price });
        }
        const input = formatPrice(model, "input", "M", false, priceRate, usdExchangeRate);
        if (!input || input === "-") return "";
        return t("canvas.promptPanel.pricePerMillion", { price: input });
    }, [modelName, modelValue, models, priceRate, resolution, t, usdExchangeRate]);

    if (!label) return null;

    return (
        <span
            className={className ?? "shrink-0 whitespace-nowrap text-[11px] tabular-nums opacity-70"}
            title={label}
        >
            {label}
        </span>
    );
}
