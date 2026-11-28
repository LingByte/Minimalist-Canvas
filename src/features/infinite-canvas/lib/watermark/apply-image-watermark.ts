import { DEFAULT_LOGO } from "@/lib/constants";

export type WatermarkPlacement =
    | "top-start"
    | "top"
    | "top-end"
    | "left"
    | "middle"
    | "right"
    | "bottom-start"
    | "bottom"
    | "bottom-end";

/** @deprecated Prefer WatermarkEffectId for visual looks. Kept for migration. */
export type WatermarkStyle = "fill" | "stroke" | "badge";

/** Layout that combines logo + text as one mark. */
export type WatermarkTemplateId = "inline" | "stack" | "pill" | "seal" | "text" | "logo";

/** Special text appearance presets (the visual “模版”). */
export type WatermarkEffectId =
    | "classic"
    | "solid"
    | "soft-shadow"
    | "neon"
    | "hollow"
    | "emboss"
    | "gold"
    | "stamp"
    | "frost"
    | "cinema";

export type ImageWatermarkInput = {
    text?: string;
    logoUrl?: string;
    template?: WatermarkTemplateId;
    effect?: WatermarkEffectId;
    placement?: WatermarkPlacement;
    /** 0–1 */
    opacity?: number;
    /** Pixel size on the exported image. */
    fontSize?: number;
    rotate?: number;
    style?: WatermarkStyle;
    fontFamily?: string;
    fontWeight?: string;
    fontColor?: string;
    strokeColor?: string;
};

export const WATERMARK_DEFAULT_FONT_SIZE = 32;
export const WATERMARK_PRODUCT_LOGO = DEFAULT_LOGO;

export const WATERMARK_EFFECT_OPTIONS = [
    { id: "classic", labelKey: "watermark.effects.classic" },
    { id: "solid", labelKey: "watermark.effects.solid" },
    { id: "soft-shadow", labelKey: "watermark.effects.softShadow" },
    { id: "neon", labelKey: "watermark.effects.neon" },
    { id: "hollow", labelKey: "watermark.effects.hollow" },
    { id: "emboss", labelKey: "watermark.effects.emboss" },
    { id: "gold", labelKey: "watermark.effects.gold" },
    { id: "stamp", labelKey: "watermark.effects.stamp" },
    { id: "frost", labelKey: "watermark.effects.frost" },
    { id: "cinema", labelKey: "watermark.effects.cinema" },
] as const;

export const WATERMARK_TEMPLATE_OPTIONS = [
    { id: "inline", labelKey: "watermark.templates.inline" },
    { id: "stack", labelKey: "watermark.templates.stack" },
    { id: "pill", labelKey: "watermark.templates.pill" },
    { id: "seal", labelKey: "watermark.templates.seal" },
    { id: "text", labelKey: "watermark.templates.text" },
    { id: "logo", labelKey: "watermark.templates.logo" },
] as const;

export const WATERMARK_FONT_OPTIONS = [
    { id: "system-sans", labelKey: "watermark.fonts.systemSans", family: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
    { id: "public-sans", labelKey: "watermark.fonts.publicSans", family: '"Public Sans Variable", "PingFang SC", "Microsoft YaHei", sans-serif' },
    { id: "heiti", labelKey: "watermark.fonts.heiti", family: '"Heiti SC", "STHeiti", "SimHei", "Microsoft YaHei", sans-serif' },
    { id: "yuanti", labelKey: "watermark.fonts.yuanti", family: '"Yuanti SC", "STYuanti", "YouYuan", "PingFang SC", sans-serif' },
    { id: "lora", labelKey: "watermark.fonts.lora", family: '"Lora Variable", "Songti SC", "Noto Serif SC", serif' },
    { id: "songti", labelKey: "watermark.fonts.songti", family: '"Songti SC", "STSong", "SimSun", "Noto Serif SC", serif' },
    { id: "kaiti", labelKey: "watermark.fonts.kaiti", family: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif' },
    { id: "fangsong", labelKey: "watermark.fonts.fangsong", family: '"STFangsong", "FangSong", "仿宋", "Songti SC", serif' },
    { id: "system-serif", labelKey: "watermark.fonts.systemSerif", family: 'Georgia, "Times New Roman", "Songti SC", "Noto Serif SC", serif' },
    { id: "display", labelKey: "watermark.fonts.display", family: 'Impact, Haettenschweiler, "Arial Narrow Bold", "PingFang SC", sans-serif' },
    { id: "mono", labelKey: "watermark.fonts.mono", family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Sarasa Mono SC", monospace' },
] as const;

export type WatermarkFontId = (typeof WATERMARK_FONT_OPTIONS)[number]["id"];

export function resolveWatermarkFontFamily(fontId?: string, customFamily?: string) {
    if (customFamily?.trim()) return customFamily.trim();
    const matched = WATERMARK_FONT_OPTIONS.find((item) => item.id === fontId);
    return matched?.family || WATERMARK_FONT_OPTIONS[0].family;
}

export function clampWatermarkOpacity(value: unknown, fallback = 0.72) {
    const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(1, Math.max(0.05, raw));
}

export function clampWatermarkFontSize(value: unknown, fallback = WATERMARK_DEFAULT_FONT_SIZE) {
    const raw = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    if (raw <= 0) return fallback;
    return Math.max(8, Math.min(200, Math.round(raw)));
}

export function normalizeWatermarkTemplate(value: unknown): WatermarkTemplateId {
    const allowed: WatermarkTemplateId[] = ["inline", "stack", "pill", "seal", "text", "logo"];
    return typeof value === "string" && allowed.includes(value as WatermarkTemplateId)
        ? (value as WatermarkTemplateId)
        : "inline";
}

export function normalizeWatermarkEffect(value: unknown, legacyStyle?: unknown): WatermarkEffectId {
    const allowed: WatermarkEffectId[] = [
        "classic",
        "solid",
        "soft-shadow",
        "neon",
        "hollow",
        "emboss",
        "gold",
        "stamp",
        "frost",
        "cinema",
    ];
    if (typeof value === "string" && allowed.includes(value as WatermarkEffectId)) {
        return value as WatermarkEffectId;
    }
    if (legacyStyle === "fill") return "solid";
    if (legacyStyle === "badge") return "stamp";
    return "classic";
}

async function blobFromUrl(url: string): Promise<Blob> {
    if (/^https?:\/\//i.test(url)) {
        try {
            const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
            return (await tauriFetch(url)).blob();
        } catch {
            // Fall through to webview fetch.
        }
    }
    return (await fetch(url)).blob();
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (!src.startsWith("blob:") && !src.startsWith("data:")) {
            img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image for watermark"));
        img.src = src;
    });
}

async function rasterizeLogo(logoUrl: string): Promise<HTMLCanvasElement> {
    const logo = await loadImageElement(logoUrl);
    await logo.decode?.().catch(() => undefined);
    const naturalW = Math.max(1, logo.naturalWidth || logo.width || 1);
    const naturalH = Math.max(1, logo.naturalHeight || logo.height || 1);
    const maxEdge = 1024;
    const scale = Math.min(1, maxEdge / Math.max(naturalW, naturalH));
    const width = Math.max(1, Math.round(naturalW * scale));
    const height = Math.max(1, Math.round(naturalH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(logo, 0, 0, width, height);
    return canvas;
}

function placementToAnchor(placement: WatermarkPlacement): { x: number; y: number } {
    switch (placement) {
        case "top-start":
            return { x: 0.08, y: 0.08 };
        case "top":
            return { x: 0.5, y: 0.08 };
        case "top-end":
            return { x: 0.92, y: 0.08 };
        case "left":
            return { x: 0.08, y: 0.5 };
        case "middle":
            return { x: 0.5, y: 0.5 };
        case "right":
            return { x: 0.92, y: 0.5 };
        case "bottom-start":
            return { x: 0.08, y: 0.92 };
        case "bottom":
            return { x: 0.5, y: 0.92 };
        case "bottom-end":
        default:
            return { x: 0.92, y: 0.92 };
    }
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function paintText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    input: ImageWatermarkInput,
    opacity: number,
    fontSize: number,
) {
    const effect = normalizeWatermarkEffect(input.effect, input.style);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `${input.fontWeight || "600"} ${fontSize}px ${input.fontFamily || resolveWatermarkFontFamily()}`;
    ctx.globalAlpha = opacity;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const line = Math.max(1.5, fontSize * 0.08);

    switch (effect) {
        case "solid": {
            ctx.shadowColor = `rgba(0,0,0,${0.35 * opacity})`;
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = input.fontColor || "#ffffff";
            ctx.fillText(text, x, y);
            break;
        }
        case "soft-shadow": {
            ctx.shadowColor = `rgba(0,0,0,${0.7 * opacity})`;
            ctx.shadowBlur = Math.max(8, fontSize * 0.35);
            ctx.shadowOffsetY = Math.max(2, fontSize * 0.08);
            ctx.fillStyle = input.fontColor || "#ffffff";
            ctx.fillText(text, x, y);
            break;
        }
        case "neon": {
            ctx.shadowColor = "rgba(56, 189, 248, 0.95)";
            ctx.shadowBlur = Math.max(12, fontSize * 0.55);
            ctx.lineWidth = line;
            ctx.strokeStyle = "rgba(125, 211, 252, 0.95)";
            ctx.strokeText(text, x, y);
            ctx.fillStyle = "#f0f9ff";
            ctx.fillText(text, x, y);
            ctx.shadowBlur = Math.max(4, fontSize * 0.2);
            ctx.fillText(text, x, y);
            break;
        }
        case "hollow": {
            ctx.lineWidth = Math.max(2, line * 1.35);
            ctx.strokeStyle = input.fontColor || "#ffffff";
            ctx.shadowColor = `rgba(0,0,0,${0.4 * opacity})`;
            ctx.shadowBlur = 3;
            ctx.strokeText(text, x, y);
            break;
        }
        case "emboss": {
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillText(text, x + 1, y + 1);
            ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.fillText(text, x - 1, y - 1);
            ctx.fillStyle = input.fontColor || "#e7e5e4";
            ctx.fillText(text, x, y);
            break;
        }
        case "gold": {
            ctx.shadowColor = `rgba(0,0,0,${0.45 * opacity})`;
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 1;
            ctx.lineWidth = line;
            ctx.strokeStyle = "rgba(120, 53, 15, 0.85)";
            ctx.strokeText(text, x, y);
            ctx.fillStyle = "#fbbf24";
            ctx.fillText(text, x, y);
            ctx.globalAlpha = opacity * 0.55;
            ctx.fillStyle = "#fde68a";
            ctx.fillText(text, x, y - Math.max(1, fontSize * 0.04));
            ctx.globalAlpha = opacity;
            break;
        }
        case "stamp": {
            const metrics = ctx.measureText(text);
            const padX = Math.round(fontSize * 0.5);
            const padY = Math.round(fontSize * 0.32);
            roundRect(ctx, x - padX, y - fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2, Math.min(10, fontSize * 0.35));
            ctx.fillStyle = `rgba(12, 10, 9, ${0.52 * opacity})`;
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, x, y);
            break;
        }
        case "frost": {
            const metrics = ctx.measureText(text);
            const padX = Math.round(fontSize * 0.48);
            const padY = Math.round(fontSize * 0.3);
            roundRect(ctx, x - padX, y - fontSize / 2 - padY, metrics.width + padX * 2, fontSize + padY * 2, Math.min(12, fontSize * 0.4));
            ctx.fillStyle = `rgba(255,255,255,${0.22 * opacity})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255,255,255,${0.45 * opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.shadowColor = "rgba(255,255,255,0.35)";
            ctx.shadowBlur = 6;
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.fillText(text, x, y);
            break;
        }
        case "cinema": {
            ctx.letterSpacing = `${Math.max(1, Math.round(fontSize * 0.08))}px`;
            ctx.shadowColor = `rgba(0,0,0,${0.55 * opacity})`;
            ctx.shadowBlur = 4;
            ctx.fillStyle = "#fafafa";
            ctx.fillText(text, x, y);
            const metrics = ctx.measureText(text);
            ctx.shadowColor = "transparent";
            ctx.fillStyle = `rgba(250,250,250,${0.75 * opacity})`;
            ctx.fillRect(x, y + fontSize * 0.42, metrics.width, Math.max(1, fontSize * 0.06));
            ctx.letterSpacing = "0px";
            break;
        }
        case "classic":
        default: {
            ctx.shadowColor = `rgba(0,0,0,${0.45 * opacity})`;
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 1;
            ctx.lineWidth = Math.max(2, line);
            ctx.strokeStyle = input.strokeColor || `rgba(12, 10, 9, ${0.85 * opacity})`;
            ctx.strokeText(text, x, y);
            ctx.fillStyle = input.fontColor || "#ffffff";
            ctx.fillText(text, x, y);
            break;
        }
    }
}

type LayoutBox = { width: number; height: number };

async function drawTemplateMark(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    input: ImageWatermarkInput,
) {
    const template = normalizeWatermarkTemplate(input.template);
    const text = (input.text || "").trim();
    const logoUrl = (input.logoUrl || "").trim();
    const wantText = template !== "logo" && Boolean(text);
    const wantLogo = template !== "text" && Boolean(logoUrl);
    if (!wantText && !wantLogo) return;

    const opacity = clampWatermarkOpacity(input.opacity);
    const fontSize = clampWatermarkFontSize(input.fontSize);
    const fontFamily = input.fontFamily || resolveWatermarkFontFamily();
    const fontWeight = input.fontWeight || "600";
    const gap = Math.max(8, Math.round(fontSize * 0.28));

    let logoCanvas: HTMLCanvasElement | null = null;
    let logoW = 0;
    let logoH = 0;
    if (wantLogo) {
        logoCanvas = await rasterizeLogo(logoUrl);
        const aspect = logoCanvas.width / Math.max(1, logoCanvas.height);
        if (template === "logo") {
            logoH = Math.max(48, Math.round(fontSize * 2.2));
        } else if (template === "seal") {
            logoH = Math.max(28, Math.round(fontSize * 1.55));
        } else {
            logoH = Math.max(22, Math.round(fontSize * 1.15));
        }
        logoW = Math.max(22, Math.round(logoH * aspect));
    }

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const textW = wantText ? ctx.measureText(text).width : 0;
    const textH = wantText ? fontSize : 0;

    let box: LayoutBox = { width: 0, height: 0 };
    if (template === "stack" && wantLogo && wantText) {
        box = { width: Math.max(logoW, textW), height: logoH + gap + textH };
    } else if (template === "pill" && (wantLogo || wantText)) {
        const contentW = (wantLogo ? logoW : 0) + (wantLogo && wantText ? gap : 0) + textW;
        const contentH = Math.max(logoH, textH);
        const padX = Math.round(fontSize * 0.55);
        const padY = Math.round(fontSize * 0.38);
        box = { width: contentW + padX * 2, height: contentH + padY * 2 };
    } else if (template === "seal" && wantLogo && wantText) {
        box = { width: logoW + gap + textW, height: Math.max(logoW, textH) };
    } else if (wantLogo && wantText) {
        // inline (default)
        box = { width: logoW + gap + textW, height: Math.max(logoH, textH) };
    } else if (wantLogo) {
        box = { width: logoW, height: logoH };
    } else {
        box = { width: textW, height: textH };
    }

    const { x, y } = placementToAnchor(input.placement || "bottom-end");
    const cx = canvasW * x;
    const cy = canvasH * y;
    const rotate = ((input.rotate ?? 0) * Math.PI) / 180;

    // Keep the group inside the canvas with a small margin.
    const margin = 12;
    const halfW = box.width / 2;
    const halfH = box.height / 2;
    const clampedX = Math.min(canvasW - margin - halfW, Math.max(margin + halfW, cx));
    const clampedY = Math.min(canvasH - margin - halfH, Math.max(margin + halfH, cy));

    ctx.translate(clampedX, clampedY);
    ctx.rotate(rotate);

    const originX = -halfW;
    const originY = -halfH;

    if (template === "pill") {
        const radius = Math.min(box.height / 2, Math.round(fontSize * 0.7));
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "rgba(12, 10, 9, 0.48)";
        roundRect(ctx, originX, originY, box.width, box.height, radius);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();

        const padX = Math.round(fontSize * 0.55);
        let cursorX = originX + padX;
        const midY = 0;
        if (logoCanvas) {
            ctx.globalAlpha = opacity;
            ctx.drawImage(logoCanvas, cursorX, midY - logoH / 2, logoW, logoH);
            cursorX += logoW + (wantText ? gap : 0);
        }
        if (wantText) {
            paintText(ctx, text, cursorX, midY, { ...input, effect: input.effect || "solid" }, opacity, fontSize);
        }
        ctx.restore();
        return;
    }

    if (template === "seal" && logoCanvas && wantText) {
        const sealSize = Math.max(logoW, logoH);
        ctx.globalAlpha = opacity * 0.9;
        ctx.fillStyle = "rgba(12, 10, 9, 0.42)";
        ctx.beginPath();
        ctx.arc(originX + sealSize / 2, 0, sealSize / 2 + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoCanvas, originX + (sealSize - logoW) / 2, -logoH / 2, logoW, logoH);
        paintText(ctx, text, originX + sealSize + gap, 0, input, opacity, fontSize);
        ctx.restore();
        return;
    }

    if (template === "stack" && logoCanvas && wantText) {
        const logoX = originX + (box.width - logoW) / 2;
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoCanvas, logoX, originY, logoW, logoH);
        const textX = originX + (box.width - textW) / 2;
        paintText(ctx, text, textX, originY + logoH + gap + textH / 2, input, opacity, fontSize);
        ctx.restore();
        return;
    }

    // inline / text / logo
    let cursorX = originX;
    const midY = 0;
    if (logoCanvas) {
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoCanvas, cursorX, midY - logoH / 2, logoW, logoH);
        cursorX += logoW + (wantText ? gap : 0);
    }
    if (wantText) {
        paintText(ctx, text, cursorX, midY, input, opacity, fontSize);
    }
    ctx.restore();
}

/**
 * Burn a visible watermark into an image and return a PNG blob.
 * Pure Canvas 2D compositing (source first, then marks) — reliable in Tauri webview.
 */
export async function applyImageWatermark(
    source: string | Blob,
    input: ImageWatermarkInput,
): Promise<Blob> {
    const template = normalizeWatermarkTemplate(input.template);
    const text = (input.text || "").trim();
    const logoUrl = (input.logoUrl || "").trim();
    const wantText = template !== "logo" && Boolean(text);
    const wantLogo = template !== "text" && Boolean(logoUrl);
    if (!wantText && !wantLogo) {
        return typeof source === "string" ? blobFromUrl(source) : source;
    }

    const sourceBlob = typeof source === "string" ? await blobFromUrl(source) : source;
    const objectUrl = URL.createObjectURL(sourceBlob);

    try {
        const img = await loadImageElement(objectUrl);
        await img.decode?.().catch(() => undefined);
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (width < 2 || height < 2) {
            throw new Error("Invalid source image size");
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D unavailable");

        ctx.drawImage(img, 0, 0, width, height);

        await drawTemplateMark(ctx, width, height, {
            ...input,
            template,
            effect: normalizeWatermarkEffect(input.effect, input.style),
            text: wantText ? text : "",
            logoUrl: wantLogo ? logoUrl : "",
            opacity: clampWatermarkOpacity(input.opacity),
            fontSize: clampWatermarkFontSize(input.fontSize),
            fontFamily: input.fontFamily || resolveWatermarkFontFamily(),
        });

        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Watermark encode failed"))), "image/png");
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
