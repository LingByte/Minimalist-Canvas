export type ImageCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ImageAngleTransform = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
};

export type ImageUpscaleAlgorithm = "nearest" | "bilinear" | "high";

export const MAX_UPSCALE_LONG_EDGE = 4096;

export type ImageUpscaleParams = {
    targetLongEdge: number;
    algorithm: ImageUpscaleAlgorithm;
};

export type ImageSplitParams = {
    rows: number;
    columns: number;
    horizontalLines?: number[];
    verticalLines?: number[];
};

export type ImageSplitPiece = {
    row: number;
    column: number;
    dataUrl: string;
};

export type FaceMeshPattern = "diamond" | "square";

/** Fishnet / mesh overlay for face images (local canvas draw). */
export type FaceMeshParams = {
    /** Grid cell size as a fraction of the shorter image edge (0.02–0.12). */
    spacingRatio: number;
    /** Stroke width as a fraction of the shorter image edge (0.001–0.02). */
    lineWidthRatio: number;
    opacity: number;
    color: string;
    pattern: FaceMeshPattern;
};

export const DEFAULT_FACE_MESH_PARAMS: FaceMeshParams = {
    spacingRatio: 0.038,
    lineWidthRatio: 0.0045,
    opacity: 0.88,
    color: "#0a0a0a",
    pattern: "diamond",
};

export async function overlayFaceMeshDataUrl(
    dataUrl: string,
    params: FaceMeshParams = DEFAULT_FACE_MESH_PARAMS,
    maskDataUrl?: string,
) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.drawImage(image, 0, 0);

    if (maskDataUrl) {
        const meshLayer = document.createElement("canvas");
        meshLayer.width = image.width;
        meshLayer.height = image.height;
        const meshContext = meshLayer.getContext("2d");
        if (!meshContext) return exportCanvasPng(canvas);
        drawFaceMesh(meshContext, image.width, image.height, params);
        const mask = await loadImage(maskDataUrl);
        meshContext.globalCompositeOperation = "destination-in";
        meshContext.drawImage(mask, 0, 0);
        context.drawImage(meshLayer, 0, 0);
    } else {
        drawFaceMesh(context, image.width, image.height, params);
    }

    return exportCanvasPng(canvas);
}

function exportCanvasPng(canvas: HTMLCanvasElement) {
    try {
        return canvas.toDataURL("image/png");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/tainted|insecure|SecurityError/i.test(message)) {
            throw new Error("Image cannot be exported because it was loaded from a cross-origin URL without CORS. Re-upload or remirror the image, then try again.");
        }
        throw error;
    }
}

/** Full-frame mesh pattern canvas used for brush preview clipping. */
export function createFaceMeshPatternCanvas(width: number, height: number, params: FaceMeshParams = DEFAULT_FACE_MESH_PARAMS) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const context = canvas.getContext("2d");
    if (context) drawFaceMesh(context, canvas.width, canvas.height, params);
    return canvas;
}

export function drawFaceMesh(context: CanvasRenderingContext2D, width: number, height: number, params: FaceMeshParams) {
    const minEdge = Math.max(1, Math.min(width, height));
    const spacing = Math.max(4, Math.round(minEdge * clamp(params.spacingRatio, 0.015, 0.16)));
    const lineWidth = Math.max(1, minEdge * clamp(params.lineWidthRatio, 0.001, 0.03));
    const opacity = clamp(params.opacity, 0.05, 1);

    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = params.color || "#0a0a0a";
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (params.pattern === "square") {
        for (let x = 0; x <= width; x += spacing) {
            context.beginPath();
            context.moveTo(x + 0.5, 0);
            context.lineTo(x + 0.5, height);
            context.stroke();
        }
        for (let y = 0; y <= height; y += spacing) {
            context.beginPath();
            context.moveTo(0, y + 0.5);
            context.lineTo(width, y + 0.5);
            context.stroke();
        }
    } else {
        // Diamond / fishnet: two diagonal families (like stockings mesh).
        const extent = width + height;
        for (let i = -extent; i <= extent; i += spacing) {
            context.beginPath();
            context.moveTo(i, 0);
            context.lineTo(i + height, height);
            context.stroke();
        }
        for (let i = -extent; i <= extent * 2; i += spacing) {
            context.beginPath();
            context.moveTo(i, 0);
            context.lineTo(i - height, height);
            context.stroke();
        }
    }

    context.restore();
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export async function cropDataUrl(dataUrl: string, crop?: ImageCropRect) {
    const image = await loadImage(dataUrl);
    if (crop) {
        return drawCrop(image, Math.floor(crop.x * image.width), Math.floor(crop.y * image.height), Math.ceil(crop.width * image.width), Math.ceil(crop.height * image.height));
    }
    const size = Math.min(image.width, image.height);
    const sx = Math.max(0, Math.floor((image.width - size) / 2));
    const sy = Math.max(0, Math.floor((image.height - size) / 2));
    return drawCrop(image, sx, sy, size, size);
}

export async function splitDataUrl(dataUrl: string, params: ImageSplitParams): Promise<ImageSplitPiece[]> {
    const image = await loadImage(dataUrl);
    const xCuts = buildSplitCuts(params.verticalLines, image.width, Math.max(1, Math.floor(params.columns)));
    const yCuts = buildSplitCuts(params.horizontalLines, image.height, Math.max(1, Math.floor(params.rows)));
    const pieces: ImageSplitPiece[] = [];

    for (let row = 0; row < yCuts.length - 1; row += 1) {
        const sy = yCuts[row];
        const sh = yCuts[row + 1] - sy;
        for (let column = 0; column < xCuts.length - 1; column += 1) {
            const sx = xCuts[column];
            const sw = xCuts[column + 1] - sx;
            pieces.push({ row, column, dataUrl: drawCrop(image, sx, sy, sw, sh) });
        }
    }

    return pieces;
}

function buildSplitCuts(lines: number[] | undefined, size: number, count: number) {
    if (!lines?.length) return Array.from({ length: count + 1 }, (_, index) => Math.floor((index * size) / count));
    return [0, ...lines.map((line) => Math.round(line * size)).filter((line) => line > 0 && line < size).sort((a, b) => a - b), size];
}

export async function transformAngleDataUrl(dataUrl: string, params: ImageAngleTransform) {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    const padding = Math.round(Math.max(image.width, image.height) * 0.18);
    canvas.width = image.width + padding * 2;
    canvas.height = image.height + padding * 2;
    const context = canvas.getContext("2d");
    if (!context) return dataUrl;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const horizontal = params.horizontalAngle / 60;
    const pitch = params.pitchAngle / 45;
    const distanceScale = 1.12 - params.cameraDistance * 0.035;
    const wideScale = params.wideAngle ? 0.88 : 1;
    const scale = Math.max(0.64, Math.min(1.1, distanceScale * wideScale));
    const width = image.width * scale * (1 - Math.abs(horizontal) * 0.28);
    const height = image.height * scale * (1 - Math.abs(pitch) * 0.18);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const skewX = horizontal * image.width * 0.18;
    const skewY = pitch * image.height * 0.12;
    const x = cx - width / 2 + horizontal * padding * 0.5;
    const y = cy - height / 2 + pitch * padding * 0.45;

    context.save();
    context.setTransform(1, pitch * 0.08, horizontal * -0.1, 1, 0, 0);
    context.drawImage(image, x + skewX, y + skewY, width, height);
    context.restore();

    if (params.wideAngle) {
        const gradient = context.createRadialGradient(cx, cy, Math.min(canvas.width, canvas.height) * 0.2, cx, cy, Math.max(canvas.width, canvas.height) * 0.62);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0.18)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    return exportCanvasPng(canvas);
}

export async function upscaleDataUrl(dataUrl: string, params: ImageUpscaleParams) {
    const image = await loadImage(dataUrl);
    const { width, height } = resolveUpscaleSize(image.width, image.height, params.targetLongEdge);
    return params.algorithm === "high" ? drawStepUpscale(image, width, height) : drawResize(image, image.width, image.height, width, height, params.algorithm);
}

export function resolveUpscaleSize(width: number, height: number, targetLongEdge: number) {
    const longEdge = Math.max(1, width, height);
    const target = Math.min(MAX_UPSCALE_LONG_EDGE, Math.max(1, Math.round(targetLongEdge)));
    const scale = target / longEdge;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawCrop(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const context = canvas.getContext("2d");
    if (!context) return image.src;
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return exportCanvasPng(canvas);
}

function drawStepUpscale(image: HTMLImageElement, width: number, height: number) {
    let source: CanvasImageSource = image;
    let sourceWidth = image.width;
    let sourceHeight = image.height;

    while (sourceWidth * 2 < width && sourceHeight * 2 < height) {
        const nextWidth = sourceWidth * 2;
        const nextHeight = sourceHeight * 2;
        const next = drawResizeCanvas(source, sourceWidth, sourceHeight, nextWidth, nextHeight, "high");
        source = next;
        sourceWidth = nextWidth;
        sourceHeight = nextHeight;
    }

    return drawResize(source, sourceWidth, sourceHeight, width, height, "high");
}

function drawResize(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
    return exportCanvasPng(drawResizeCanvas(source, sourceWidth, sourceHeight, width, height, algorithm));
}

function drawResizeCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    context.imageSmoothingEnabled = algorithm !== "nearest";
    context.imageSmoothingQuality = algorithm === "bilinear" ? "medium" : "high";
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    return canvas;
}

/**
 * Load an image that is safe to draw onto a canvas and call toDataURL / getImageData.
 * Remote http(s) URLs are fetched as blobs first so the canvas is not CORS-tainted.
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
    const value = String(src || "").trim();
    if (!value) throw new Error("empty image source");

    if (value.startsWith("data:") || value.startsWith("blob:")) {
        return loadImageElement(value);
    }

    if (/^https?:\/\//i.test(value)) {
        try {
            const response = await fetch(value, { mode: "cors", credentials: "omit", cache: "force-cache" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (!blob.size) throw new Error("empty image blob");
            const objectUrl = URL.createObjectURL(blob);
            try {
                return await loadImageElement(objectUrl);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        } catch {
            // Fall through to anonymous CORS image load (still untainted when the CDN allows ACAO).
            return loadImageElement(value, true);
        }
    }

    return loadImageElement(value, true);
}

function loadImageElement(src: string, crossOrigin = false) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        if (crossOrigin) image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load image"));
        image.src = src;
    });
}
