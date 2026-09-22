import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { QUOTA_TYPE_VALUES } from "@/features/pricing/constants";
import { usePricingData } from "@/features/pricing/hooks/use-pricing-data";
import { formatPrice, formatRequestPrice } from "@/features/pricing/lib/price";
import { modelOptionName } from "@canvas/stores/use-config-store";

/** Unit-price label for the selected model from the site pricing catalog. */
export function useModelUnitPrice(modelValue: string) {
    const { t } = useTranslation();
    const { models, priceRate, usdExchangeRate } = usePricingData();
    const modelName = modelOptionName(modelValue || "").trim();

    return useMemo(() => {
        if (!modelName || !models.length) return "";
        const model = models.find((item) => item.model_name === modelName);
        if (!model) return "";
        if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
            const price = formatRequestPrice(model, false, priceRate, usdExchangeRate);
            if (!price || price === "-") return "";
            return t("workbench.pricePerRequest", { price });
        }
        const input = formatPrice(model, "input", "M", false, priceRate, usdExchangeRate);
        if (!input || input === "-") return "";
        return t("workbench.pricePerMillion", { price: input });
    }, [modelName, models, priceRate, t, usdExchangeRate]);
}
