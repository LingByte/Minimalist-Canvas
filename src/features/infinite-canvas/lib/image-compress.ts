import imageCompression from "browser-image-compression";

export type CompressImageOptions = {
    quality?: number;
    maxWidthOrHeight?: number;
    maxSizeMB?: number;
};

const defaults: Required<CompressImageOptions> = {
    quality: 0.8,
    maxWidthOrHeight: 1920,
    maxSizeMB: 2,
};

/** Compress an image blob locally (browser-image-compression). PNG stays PNG when possible. */
export async function compressImageBlob(input: Blob, options?: CompressImageOptions): Promise<Blob> {
    const quality = options?.quality ?? defaults.quality;
    const maxWidthOrHeight = options?.maxWidthOrHeight ?? defaults.maxWidthOrHeight;
    const maxSizeMB = options?.maxSizeMB ?? defaults.maxSizeMB;
    const file =
        input instanceof File
            ? input
            : new File([input], input.type.includes("png") ? "image.png" : "image.jpg", {
                  type: input.type || "image/jpeg",
              });
    return imageCompression(file, {
        maxSizeMB: Math.max(0.1, maxSizeMB),
        maxWidthOrHeight: Math.max(256, maxWidthOrHeight),
        useWebWorker: true,
        initialQuality: Math.min(1, Math.max(0.1, quality)),
        fileType: file.type.includes("png") ? "image/png" : undefined,
    });
}
