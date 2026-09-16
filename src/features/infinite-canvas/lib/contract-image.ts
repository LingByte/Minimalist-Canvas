/** Unified image-API contract models (resolution / aspect_ratio / images[] / @imageN). */

const GPT_IMAGE_2_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "2:1", "1:2"] as const;

const NANO_BANANA_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "21:9",
    "5:4",
    "4:5",
    "2:1",
    "1:2",
    "9:21",
    "5:3",
    "3:5",
    "16:10",
    "10:16",
    "7:3",
    "3:7",
] as const;

export const CONTRACT_IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export const CONTRACT_IMAGE_MAX_REFS = 9;
export const CONTRACT_IMAGE_TIMEOUT_MS = 600_000;

/** Strip canvas channel encoding (`channelId::model`) before matching contract names. */
function normalizeContractModelName(modelName: string) {
    const raw = modelName.trim().toLowerCase();
    const sep = raw.indexOf("::");
    return sep >= 0 ? raw.slice(sep + 2).trim() : raw;
}

export function isContractImageModel(modelName: string): boolean {
    const name = normalizeContractModelName(modelName);
    if (!name) return false;
    if (name.startsWith("gg-gpt-image-")) return true;
    if (name.startsWith("gg-nano-banana")) return true;
    if (name.includes("nano-banana")) return true;
    if (name === "gpt-image-2" || name.startsWith("gpt-image-2-") || name.includes("gpt-image-2")) return true;
    return false;
}

export function isGptImage2ContractModel(modelName: string): boolean {
    return normalizeContractModelName(modelName).includes("gpt-image-2");
}

export function contractImageAspectRatios(modelName: string): readonly string[] {
    return isGptImage2ContractModel(modelName) ? GPT_IMAGE_2_RATIOS : NANO_BANANA_RATIOS;
}

export function normalizeContractResolution(value: string | undefined): "1K" | "2K" | "4K" {
    const raw = (value || "").trim().toUpperCase();
    if (raw === "1K" || raw === "2K" || raw === "4K") return raw;
    return "2K";
}

export function normalizeContractAspectRatio(value: string | undefined, modelName: string): string {
    const raw = (value || "").trim();
    const allowed = contractImageAspectRatios(modelName);
    if (allowed.includes(raw as (typeof allowed)[number])) return raw;
    if (raw.includes("x")) {
        const match = raw.match(/^(\d+)x(\d+)$/i);
        if (match) {
            const w = Number(match[1]);
            const h = Number(match[2]);
            if (w > 0 && h > 0) {
                const target = w / h;
                return allowed.reduce((best, item) => {
                    const [bw, bh] = best.split(":").map(Number);
                    const [cw, ch] = item.split(":").map(Number);
                    return Math.abs(cw / ch - target) < Math.abs(bw / bh - target) ? item : best;
                });
            }
        }
    }
    return "1:1";
}

export function normalizeContractQuality(value: string | undefined): "high" | "medium" {
    const raw = (value || "").trim().toLowerCase();
    if (raw === "medium") return "medium";
    return "high";
}

export function buildContractImagePrompt(prompt: string, imageCount: number): string {
    const text = prompt.trim();
    if (imageCount <= 0) return text;
    const markers = Array.from({ length: imageCount }, (_, index) => `@image${index + 1}`).join(" ");
    if (!text) return markers;
    if (/@image\d+/i.test(text)) return text;
    return `${markers}\n${text}`;
}
