import { create } from "zustand";

import type {
    WatermarkEffectId,
    WatermarkFontId,
    WatermarkPlacement,
    WatermarkStyle,
    WatermarkTemplateId,
} from "@canvas/lib/watermark/apply-image-watermark";
import {
    clampWatermarkFontSize,
    clampWatermarkOpacity,
    normalizeWatermarkEffect,
    normalizeWatermarkTemplate,
    resolveWatermarkFontFamily,
    WATERMARK_DEFAULT_FONT_SIZE,
    WATERMARK_FONT_OPTIONS,
    WATERMARK_PRODUCT_LOGO,
    type ImageWatermarkInput,
} from "@canvas/lib/watermark/apply-image-watermark";

const STORAGE_KEY = "minimalist-canvas:image-watermark-v3";
/** ~300KB binary ≈ 400KB base64; keep logos across reloads. */
const LOGO_PERSIST_MAX_CHARS = 420_000;

export type WatermarkLogoMode = "product" | "custom" | "off";

export type ImageWatermarkSettings = {
    enabled: boolean;
    text: string;
    logoMode: WatermarkLogoMode;
    logoDataUrl: string;
    template: WatermarkTemplateId;
    effect: WatermarkEffectId;
    placement: WatermarkPlacement;
    opacity: number;
    style: WatermarkStyle;
    rotate: number;
    fontId: WatermarkFontId;
    fontSize: number;
};

type WatermarkStore = ImageWatermarkSettings & {
    setEnabled: (enabled: boolean) => void;
    setText: (text: string) => void;
    setLogoMode: (logoMode: WatermarkLogoMode) => void;
    setLogoDataUrl: (logoDataUrl: string) => void;
    setTemplate: (template: WatermarkTemplateId) => void;
    setEffect: (effect: WatermarkEffectId) => void;
    setPlacement: (placement: WatermarkPlacement) => void;
    setOpacity: (opacity: number) => void;
    setStyle: (style: WatermarkStyle) => void;
    setRotate: (rotate: number) => void;
    setFontId: (fontId: WatermarkFontId) => void;
    setFontSize: (fontSize: number) => void;
    patch: (partial: Partial<ImageWatermarkSettings>) => void;
};

const defaults: ImageWatermarkSettings = {
    enabled: false,
    text: "至简画布",
    logoMode: "product",
    logoDataUrl: "",
    template: "inline",
    effect: "classic",
    placement: "bottom-end",
    opacity: 0.72,
    style: "stroke",
    rotate: 0,
    fontId: "system-sans",
    fontSize: WATERMARK_DEFAULT_FONT_SIZE,
};

export function resolveWatermarkLogoUrl(state: ImageWatermarkSettings = useWatermarkStore.getState()) {
    if (state.logoMode === "off") return "";
    if (state.logoMode === "custom" && state.logoDataUrl) return state.logoDataUrl;
    return WATERMARK_PRODUCT_LOGO;
}

export function buildWatermarkApplyInput(
    state: ImageWatermarkSettings = useWatermarkStore.getState(),
    options?: { fontSizeScale?: number },
): ImageWatermarkInput {
    const scale = options?.fontSizeScale ?? 1;
    return {
        text: state.text,
        logoUrl: resolveWatermarkLogoUrl(state) || undefined,
        template: state.template,
        effect: state.effect,
        placement: state.placement,
        opacity: state.opacity,
        style: state.style,
        rotate: state.rotate,
        fontFamily: resolveWatermarkFontFamily(state.fontId),
        fontSize: Math.max(8, Math.round(state.fontSize * scale)),
    };
}

/** True when watermark content exists and the feature switch is on. */
export function isWatermarkReady(state: ImageWatermarkSettings = useWatermarkStore.getState()) {
    if (!state.enabled) return false;
    const logoUrl = resolveWatermarkLogoUrl(state);
    const template = state.template;
    if (template === "logo") return Boolean(logoUrl);
    if (template === "text") return Boolean(state.text.trim());
    return Boolean(state.text.trim() || logoUrl);
}

function normalizePlacement(value: unknown): WatermarkPlacement | null {
    const allowed: WatermarkPlacement[] = [
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
    if (typeof value !== "string") return null;
    if (value === "middle-start") return "left";
    if (value === "middle-end") return "right";
    return allowed.includes(value as WatermarkPlacement) ? (value as WatermarkPlacement) : null;
}

function normalizeFontId(value: unknown): WatermarkFontId {
    if (typeof value === "string" && WATERMARK_FONT_OPTIONS.some((item) => item.id === value)) {
        return value as WatermarkFontId;
    }
    return defaults.fontId;
}

function normalizeLogoMode(value: unknown, logoDataUrl: string): WatermarkLogoMode {
    if (value === "product" || value === "custom" || value === "off") return value;
    // Migrate v1: custom logo string → custom; otherwise product default.
    return logoDataUrl ? "custom" : "product";
}

function readStored(): ImageWatermarkSettings {
    if (typeof window === "undefined") return defaults;
    try {
        const raw =
            window.localStorage.getItem(STORAGE_KEY) ||
            window.localStorage.getItem("minimalist-canvas:image-watermark-v2") ||
            window.localStorage.getItem("minimalist-canvas:image-watermark-v1");
        if (!raw) return defaults;
        const parsed = JSON.parse(raw) as Partial<ImageWatermarkSettings> & { logoDataUrl?: string };
        const logoDataUrl = typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl : "";
        return {
            enabled: Boolean(parsed.enabled),
            text: typeof parsed.text === "string" ? parsed.text : defaults.text,
            logoMode: normalizeLogoMode(parsed.logoMode, logoDataUrl),
            logoDataUrl,
            template: normalizeWatermarkTemplate(parsed.template),
            effect: normalizeWatermarkEffect(parsed.effect, parsed.style),
            placement: normalizePlacement(parsed.placement) || defaults.placement,
            opacity: clampWatermarkOpacity(parsed.opacity, defaults.opacity),
            style: (parsed.style as WatermarkStyle) || defaults.style,
            rotate:
                typeof parsed.rotate === "number"
                    ? parsed.rotate === -18
                        ? 0
                        : parsed.rotate
                    : defaults.rotate,
            fontId: normalizeFontId(parsed.fontId),
            fontSize: clampWatermarkFontSize(parsed.fontSize, defaults.fontSize),
        };
    } catch {
        return defaults;
    }
}

function persist(state: ImageWatermarkSettings) {
    try {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                enabled: state.enabled,
                text: state.text,
                logoMode: state.logoMode,
                logoDataUrl:
                    state.logoMode === "custom" && state.logoDataUrl.length <= LOGO_PERSIST_MAX_CHARS
                        ? state.logoDataUrl
                        : "",
                template: state.template,
                effect: state.effect,
                placement: state.placement,
                opacity: state.opacity,
                style: state.style,
                rotate: state.rotate,
                fontId: state.fontId,
                fontSize: state.fontSize,
            }),
        );
    } catch {
        // ignore quota / private mode
    }
}

export const useWatermarkStore = create<WatermarkStore>((set, get) => {
    const initial = readStored();
    return {
        ...initial,
        setEnabled: (enabled) => {
            set({ enabled });
            persist(get());
        },
        setText: (text) => {
            set({ text });
            persist(get());
        },
        setLogoMode: (logoMode) => {
            set({ logoMode, logoDataUrl: logoMode === "custom" ? get().logoDataUrl : "" });
            persist(get());
        },
        setLogoDataUrl: (logoDataUrl) => {
            set({ logoDataUrl, logoMode: logoDataUrl ? "custom" : "product" });
            persist(get());
        },
        setTemplate: (template) => {
            set({ template: normalizeWatermarkTemplate(template) });
            persist(get());
        },
        setEffect: (effect) => {
            set({ effect: normalizeWatermarkEffect(effect) });
            persist(get());
        },
        setPlacement: (placement) => {
            set({ placement });
            persist(get());
        },
        setOpacity: (opacity) => {
            set({ opacity: clampWatermarkOpacity(opacity) });
            persist(get());
        },
        setStyle: (style) => {
            set({
                style,
                effect: normalizeWatermarkEffect(undefined, style),
                rotate: style === "badge" ? 0 : get().rotate,
            });
            persist(get());
        },
        setRotate: (rotate) => {
            set({ rotate });
            persist(get());
        },
        setFontId: (fontId) => {
            set({ fontId });
            persist(get());
        },
        setFontSize: (fontSize) => {
            set({ fontSize: clampWatermarkFontSize(fontSize) });
            persist(get());
        },
        patch: (partial) => {
            set(partial);
            persist(get());
        },
    };
});
