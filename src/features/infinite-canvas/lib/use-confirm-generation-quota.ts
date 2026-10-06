import { App } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { usePricingData } from "@/features/pricing/hooks/use-pricing-data";

import {
    confirmGenerationQuota,
    estimateGenerationQuota,
    type GenerationQuotaMode,
} from "./generation-quota-confirm";

type ConfirmArgs = {
    modelValue: string;
    mode: GenerationQuotaMode;
    count?: number;
    seconds?: number | string;
    resolution?: string;
};

/** Confirm estimated quota before image/video generation on canvas or workbench. */
export function useConfirmGenerationQuota() {
    const { t } = useTranslation();
    const { modal } = App.useApp();
    const { models, priceRate, usdExchangeRate } = usePricingData();

    return useCallback(
        async (args: ConfirmArgs) => {
            const estimate = estimateGenerationQuota({
                modelValue: args.modelValue,
                mode: args.mode,
                count: args.count,
                seconds: args.seconds,
                resolution: args.resolution,
                models,
                priceRate,
                usdExchangeRate,
            });
            return confirmGenerationQuota(modal, t, estimate);
        },
        [modal, models, priceRate, t, usdExchangeRate],
    );
}
