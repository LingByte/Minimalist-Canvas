/** AICost / gpt-image-2 style image models: UI uses resolution + aspect_ratio, wire uses pixel `size`. */

/** Ratios from AICost ZZDH-aicost-image docs (all mapped to pixel size below). */
export const AICOST_IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

export const CONTRACT_IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export const CONTRACT_IMAGE_MAX_REFS = 9;
export const CONTRACT_IMAGE_TIMEOUT_MS = 600_000;

/**
 * ZZDH-aicost-image plugin size table:
 * image_size (1K/2K/4K) × aspect_ratio → pixel `size` on /v1/images/generations|edits.
 */
const CONTRACT_PIXEL_SIZE_BY_RESOLUTION: Record<"1K" | "2K" | "4K", Record<(typeof AICOST_IMAGE_ASPECT_RATIOS)[number], string>> = {
    "1K": {
        "1:1": "1024x1024",
        "16:9": "1536x864",
        "9:16": "864x1536",
        "4:3": "1360x1024",
        "3:4": "1024x1360",
        "3:2": "1536x1024",
        "2:3": "1024x1536",
    },
    "2K": {
        "1:1": "2048x2048",
        "16:9": "3072x1728",
        "9:16": "1728x3072",
        "4:3": "2720x2048",
        "3:4": "2048x2720",
        "3:2": "3072x2048",
        "2:3": "2048x3072",
    },
    "4K": {
        "1:1": "2880x2880",
        "16:9": "3840x2160",
        "9:16": "2160x3840",
        "4:3": "3328x2496",
        "3:4": "2496x3328",
        "3:2": "3520x2336",
        "2:3": "2336x3520",
    },
};

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

/** Ratios accepted by every Erchun image model in /v1/catalog. */
export const ERCHUN_IMAGE_ASPECT_RATIOS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2"] as const;

/** Erchun (贰春) image models: the ratio goes on the wire as `size`, the resolution as `quality`. */
export function isErchunImageModel(modelName: string): boolean {
    return normalizeContractModelName(modelName).startsWith("zj-image");
}

/** Models that use the resolution + aspect-ratio settings panel. */
export function usesResolutionImageSettings(modelName: string): boolean {
    return isErchunImageModel(modelName) || isContractImageModel(modelName);
}

export function erchunImageWireParams(config: { size?: string; imageResolution?: string; model?: string; imageModel?: string }) {
    const modelName = config.model || config.imageModel || "";
    return {
        size: normalizeContractAspectRatio(config.size, modelName),
        quality: normalizeContractResolution(config.imageResolution).toLowerCase(),
    };
}

export function contractImageAspectRatios(modelName = ""): readonly string[] {
    return isErchunImageModel(modelName) ? ERCHUN_IMAGE_ASPECT_RATIOS : AICOST_IMAGE_ASPECT_RATIOS;
}

export function normalizeContractResolution(value: string | undefined): "1K" | "2K" | "4K" {
    const raw = (value || "").trim().toUpperCase();
    if (raw === "1K" || raw === "2K" || raw === "4K") return raw;
    return "2K";
}

export function normalizeContractAspectRatio(value: string | undefined, modelName = ""): string {
    const raw = (value || "").trim();
    const allowed = contractImageAspectRatios(modelName).filter((item) => item.includes(":"));
    if (contractImageAspectRatios(modelName).includes(raw)) return raw;
    if (!raw && isErchunImageModel(modelName)) return "auto";
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
    // Snap unknown ratios (e.g. 21:9 from older UI) onto the closest allowed entry.
    if (raw.includes(":")) {
        const [rw, rh] = raw.split(":").map(Number);
        if (rw > 0 && rh > 0) {
            const target = rw / rh;
            return allowed.reduce((best, item) => {
                const [bw, bh] = best.split(":").map(Number);
                const [cw, ch] = item.split(":").map(Number);
                return Math.abs(cw / ch - target) < Math.abs(bw / bh - target) ? item : best;
            });
        }
    }
    return "1:1";
}

/** Map UI resolution + aspect ratio to AICost wire `size` (e.g. 2K + 16:9 → 3072x1728). */
export function resolveContractPixelSize(resolution: string | undefined, aspectRatio: string | undefined, modelName = ""): string {
    const res = normalizeContractResolution(resolution);
    const ratio = normalizeContractAspectRatio(aspectRatio, modelName) as (typeof AICOST_IMAGE_ASPECT_RATIOS)[number];
    const table = CONTRACT_PIXEL_SIZE_BY_RESOLUTION[res];
    return table[ratio] || table["1:1"];
}

/** AICost gpt-image-2 docs require quality=auto on the wire. */
export function normalizeContractQuality(_value?: string): "auto" {
    return "auto";
}

export function buildContractImagePrompt(prompt: string, imageCount: number): string {
    const text = prompt.trim();
    if (imageCount <= 0) return text;
    const markers = Array.from({ length: imageCount }, (_, index) => `@image${index + 1}`).join(" ");
    if (!text) return markers;
    if (/@image\d+/i.test(text)) return text;
    return `${markers}\n${text}`;
}
