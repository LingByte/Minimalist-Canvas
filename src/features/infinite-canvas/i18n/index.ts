import { createInstance } from "i18next";
import { initReactI18next, setI18n } from "react-i18next";

import hostI18n from "@/i18n/config";
import { normalizeInterfaceLanguage } from "@/i18n/languages";

import enUS from "@canvas/i18n/locales/en-US";
import zhCN from "@canvas/i18n/locales/zh-CN";

export type AppLocale = "zh-CN" | "en-US";

const LOCALE_STORAGE_KEY = "minimalist-canvas:locale";

function hostToCanvasLocale(hostLang?: string | null): AppLocale {
    const normalized = normalizeInterfaceLanguage(hostLang);
    if (normalized === "zhCN" || normalized === "zhTW") return "zh-CN";
    return "en-US";
}

function canvasToHostLocale(locale: AppLocale): string {
    return locale === "zh-CN" ? "zhCN" : "en";
}

function initialCanvasLocale(): AppLocale {
    if (hostI18n.language) {
        return hostToCanvasLocale(hostI18n.language);
    }
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as AppLocale | null;
    if (stored === "zh-CN" || stored === "en-US") return stored;
    return "zh-CN";
}

/**
 * Isolated i18n instance for canvas copy.
 * IMPORTANT: initReactI18next calls setI18n(instance) and would otherwise replace
 * the site-wide default — restore host immediately so leaving /canvas does not
 * leave the app bound to canvas resources (missing docs.* keys, etc.).
 */
export const canvasI18n = createInstance();

canvasI18n.use(initReactI18next).init({
    resources: {
        "zh-CN": { translation: zhCN },
        "en-US": { translation: enUS },
    },
    lng: initialCanvasLocale(),
    fallbackLng: "zh-CN",
    supportedLngs: ["zh-CN", "en-US"],
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
});

// Undo the global overwrite from initReactI18next above.
setI18n(hostI18n);

/** Call when the canvas subtree unmounts (browser back / route leave). */
export function restoreHostI18n() {
    setI18n(hostI18n);
}

/** Update canvas + host language together (keeps site chrome and canvas in sync). */
export function changeAppLocale(locale: AppLocale) {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    void hostI18n.changeLanguage(canvasToHostLocale(locale));
    return canvasI18n.changeLanguage(locale);
}

export { hostToCanvasLocale, canvasToHostLocale };

export default canvasI18n;
