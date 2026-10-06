import type { ModalFuncProps } from "antd";
import type { TFunction } from "i18next";

import { QUOTA_TYPE_VALUES } from "@/features/pricing/constants";
import { getResolutionPriceTiers, isPerSecondModel } from "@/features/pricing/lib/model-helpers";
import { formatPrice, formatRequestPrice } from "@/features/pricing/lib/price";
import type { PricingModel } from "@/features/pricing/types";
import { normalizeVideoResolution, normalizeVideoSeconds } from "@canvas/services/api/video";
import { modelOptionName } from "@canvas/stores/use-config-store";

export type GenerationQuotaMode = "image" | "video";

export type GenerationQuotaEstimateInput = {
    modelValue: string;
    mode: GenerationQuotaMode;
    count?: number;
    seconds?: number | string;
    resolution?: string;
    models: PricingModel[];
    priceRate: number;
    usdExchangeRate: number;
};

export type GenerationQuotaEstimate = {
    modelName: string;
    mode: GenerationQuotaMode;
    billingKind: "request" | "second" | "token" | "unknown";
    count: number;
    seconds?: number;
    resolution?: string;
    unitPriceLabel: string;
    totalPriceLabel: string;
};

type ConfirmModalApi = {
    confirm: (props: ModalFuncProps) => void;
};

/** Build a display estimate for the upcoming image/video generation charge. */
export function estimateGenerationQuota(input: GenerationQuotaEstimateInput): GenerationQuotaEstimate {
    const modelName = modelOptionName(input.modelValue || "").trim() || input.modelValue.trim();
    const count = Math.max(1, Math.floor(Number(input.count) || 1));
    const secondsRaw = Number(input.seconds);
    const seconds = Number.isFinite(secondsRaw) && secondsRaw > 0 ? secondsRaw : undefined;

    const model = input.models.find((item) => item.model_name === modelName);
    if (!model) {
        return {
            modelName,
            mode: input.mode,
            billingKind: "unknown",
            count,
            seconds,
            unitPriceLabel: "",
            totalPriceLabel: "",
        };
    }

    if (isPerSecondModel(model)) {
        // Align with Erchun task billing: omit → cheapest tier; unknown → most expensive.
        const tier = resolvePerSecondPriceTier(model, input.resolution);
        const billedSeconds = Number(normalizeVideoSeconds(String(input.seconds ?? "")));
        const ratio = tier?.ratio ?? 1;
        return {
            modelName,
            mode: input.mode,
            billingKind: "second",
            count,
            seconds: billedSeconds,
            resolution: tier?.resolution,
            unitPriceLabel: formatRequestTotal(model, ratio, input.priceRate, input.usdExchangeRate),
            totalPriceLabel: formatRequestTotal(model, ratio * billedSeconds * count, input.priceRate, input.usdExchangeRate),
        };
    }

    if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
        const unitPriceLabel = formatRequestPrice(model, false, input.priceRate, input.usdExchangeRate);
        const unitOk = Boolean(unitPriceLabel && unitPriceLabel !== "-");
        // Per-request models: show count × unit. Duration multipliers (if any) are server-side.
        const totalPriceLabel = unitOk ? formatRequestTotal(model, count, input.priceRate, input.usdExchangeRate) : "";
        return {
            modelName,
            mode: input.mode,
            billingKind: "request",
            count,
            seconds,
            unitPriceLabel: unitOk ? unitPriceLabel : "",
            totalPriceLabel,
        };
    }

    const unitPriceLabel = formatPrice(model, "input", "M", false, input.priceRate, input.usdExchangeRate);
    return {
        modelName,
        mode: input.mode,
        billingKind: "token",
        count,
        seconds,
        unitPriceLabel: unitPriceLabel && unitPriceLabel !== "-" ? unitPriceLabel : "",
        totalPriceLabel: "",
    };
}

/** Pick the billable resolution tier for a per-second model. */
export function resolvePerSecondPriceTier(
    model: PricingModel,
    resolution?: string,
): { resolution: string; ratio: number } | undefined {
    const tiers = getResolutionPriceTiers(model);
    if (tiers.length === 0) return undefined;
    if (tiers.length === 1) return tiers[0];
    const raw = (resolution || "").trim();
    // Omit → cheapest (matches Erchun adaptor default); unknown → most expensive.
    if (!raw) return tiers[0];
    const requested = normalizeVideoResolution(raw).toUpperCase();
    return tiers.find((item) => item.resolution === requested) ?? tiers.at(-1);
}

function formatRequestTotal(
    model: PricingModel,
    multiplier: number,
    priceRate: number,
    usdExchangeRate: number,
): string {
    if (multiplier === 1) {
        return formatRequestPrice(model, false, priceRate, usdExchangeRate);
    }
    // formatRequestPrice only formats one request; scale the underlying USD then reformat via the same helper path
    // by temporarily cloning model_price. Keeps currency / recharge formatting consistent.
    const scaled: PricingModel = {
        ...model,
        model_price: (model.model_price || 0) * multiplier,
    };
    return formatRequestPrice(scaled, false, priceRate, usdExchangeRate);
}

/** Promise-based confirm that explains estimated quota before generation. */
export function confirmGenerationQuota(
    modal: ConfirmModalApi,
    t: TFunction,
    estimate: GenerationQuotaEstimate,
): Promise<boolean> {
    const meta =
        estimate.mode === "video"
            ? t("generationQuota.videoMeta", {
                  count: estimate.count,
                  seconds: estimate.seconds ?? "-",
              })
            : t("generationQuota.imageMeta", { count: estimate.count });

    let detail: string;
    if (estimate.billingKind === "second") {
        detail = t("generationQuota.secondDetail", {
            model: estimate.modelName,
            amount: estimate.totalPriceLabel,
            unitPrice: estimate.unitPriceLabel,
            count: estimate.count,
            seconds: estimate.seconds,
            resolution: estimate.resolution || "-",
        });
    } else if (estimate.billingKind === "request" && estimate.totalPriceLabel) {
        detail = t("generationQuota.requestDetail", {
            model: estimate.modelName,
            amount: estimate.totalPriceLabel,
            unitPrice: estimate.unitPriceLabel || estimate.totalPriceLabel,
            count: estimate.count,
        });
    } else if (estimate.billingKind === "token" && estimate.unitPriceLabel) {
        detail = t("generationQuota.tokenDetail", {
            model: estimate.modelName,
            unitPrice: estimate.unitPriceLabel,
        });
    } else {
        detail = t("generationQuota.unknownDetail", { model: estimate.modelName || "-" });
    }

    return new Promise((resolve) => {
        modal.confirm({
            title: t("generationQuota.title"),
            content: (
                <div className="space-y-2 text-sm">
                    <p className="m-0">{detail}</p>
                    <p className="m-0 text-stone-500 dark:text-stone-400">{meta}</p>
                    <p className="m-0 text-stone-500 dark:text-stone-400">{t("generationQuota.disclaimer")}</p>
                </div>
            ),
            okText: t("generationQuota.ok"),
            cancelText: t("generationQuota.cancel"),
            centered: true,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
        });
    });
}
