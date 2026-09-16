import { useSystemConfigStore } from "@/stores/system-config-store";

/**
 * Format backend quota units for display.
 * quota is stored as integer units; quotaPerUnit units = 1 USD (default 500000 = $1).
 */
export function formatQuota(quota: number | null | undefined): string {
    if (quota == null || Number.isNaN(quota)) return "-";
    const { currency } = useSystemConfigStore.getState().config;
    const perUnit = currency.quotaPerUnit || 500000;
    if (!currency.displayInCurrency || currency.quotaDisplayType === "TOKENS") {
        return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(quota);
    }
    const dollars = quota / perUnit;
    const symbol =
        currency.quotaDisplayType === "CNY"
            ? "¥"
            : currency.quotaDisplayType === "CUSTOM"
              ? currency.customCurrencySymbol || "¤"
              : "$";
    const value =
        currency.quotaDisplayType === "CNY"
            ? dollars * currency.usdExchangeRate
            : currency.quotaDisplayType === "CUSTOM"
              ? dollars * currency.customCurrencyExchangeRate
              : dollars;
    const digits = Math.abs(value) >= 1000 ? 2 : 4;
    return `${symbol}${Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)}`;
}

export function formatCompactNumber(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return "-";
    return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
