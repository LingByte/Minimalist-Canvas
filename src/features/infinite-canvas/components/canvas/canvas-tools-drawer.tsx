import imageCompression from "browser-image-compression";
import { ArrowLeft, Brush, ChevronRight, Clapperboard, Download, FileImage, FlipVertical2, ImageIcon, Loader2, Palette, ScanFace, Trash2, Wand2 } from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { App, Button, Drawer, Input, InputNumber, Slider, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { CanvasNodeFaceMeshDialog } from "@canvas/components/canvas/canvas-node-face-mesh-dialog";
import { CanvasNodePortraitStyleDialog, type CanvasPortraitStyleConfirm } from "@canvas/components/canvas/canvas-node-portrait-style-dialog";
import { CanvasNodeDepthVideoDialog, type CanvasDepthVideoConfirm } from "@canvas/components/canvas/canvas-node-depth-video-dialog";
import { rotateFlipDataUrl } from "@canvas/lib/canvas/canvas-image-data";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { cn } from "@canvas/lib/utils";

type ToolId = "home" | "image-compress" | "to-png" | "face-mesh" | "flip-upside-down" | "portrait-style" | "depth-video";

type MediaItem = {
    id: string;
    name: string;
    source: File;
    previewUrl: string;
    sourceBytes: number;
    result?: File;
    resultPreviewUrl?: string;
    error?: string;
    busy?: boolean;
};

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function baseName(name: string) {
    return name.replace(/\.[^.]+$/, "") || "image";
}

function compressedFilename(name: string, mimeType: string) {
    const ext =
        mimeType.includes("webp")
            ? "webp"
            : mimeType.includes("png")
              ? "png"
              : mimeType.includes("jpeg") || mimeType.includes("jpg")
                ? "jpg"
                : "bin";
    return `${baseName(name)}-compressed.${ext}`;
}

/** Decode any browser-supported image and re-encode as real image/png (lossless). */
async function convertFileToPng(file: File): Promise<File> {
    if (file.type === "image/png") {
        return new File([file], `${baseName(file.name)}.png`, { type: "image/png", lastModified: Date.now() });
    }

    let bitmap: ImageBitmap | null = null;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        // Fall through to HTMLImageElement for older Safari / odd MIME.
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");

    if (bitmap) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
    } else {
        const objectUrl = URL.createObjectURL(file);
        try {
            const image = await loadHtmlImage(objectUrl);
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            if (!canvas.width || !canvas.height) throw new Error("invalid image");
            ctx.drawImage(image, 0, 0);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (result) => {
                if (result) resolve(result);
                else reject(new Error("png encode failed"));
            },
            "image/png",
        );
    });

    return new File([blob], `${baseName(file.name)}.png`, {
        type: "image/png",
        lastModified: Date.now(),
    });
}

function loadHtmlImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image decode failed"));
        image.src = url;
    });
}

async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
    });
}

async function dataUrlToPngFile(dataUrl: string, name: string, suffix = "mesh") {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], `${baseName(name)}-${suffix}.png`, {
        type: "image/png",
        lastModified: Date.now(),
    });
}

function revokeItems(items: MediaItem[]) {
    for (const item of items) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
    }
}

export function CanvasToolsDrawer({
    open,
    onOpenChange,
    onApplyPortraitStyle,
    onApplyDepthVideo,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApplyPortraitStyle?: (payload: { dataUrl: string; fileName?: string; style: string; model: string; prompt: string }) => Promise<void> | void;
    onApplyDepthVideo?: (payload: { dataUrl: string; mediaKind: "image" | "video"; fileName?: string; model: string; prompt: string }) => Promise<void> | void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [tool, setTool] = useState<ToolId>("home");
    const [compressItems, setCompressItems] = useState<MediaItem[]>([]);
    const [pngItems, setPngItems] = useState<MediaItem[]>([]);
    const [meshItems, setMeshItems] = useState<MediaItem[]>([]);
    const [flipItems, setFlipItems] = useState<MediaItem[]>([]);
    const [portraitItems, setPortraitItems] = useState<MediaItem[]>([]);
    const [depthItems, setDepthItems] = useState<MediaItem[]>([]);
    const [portraitPaint, setPortraitPaint] = useState<{ dataUrl: string; name: string } | null>(null);
    const [depthPaint, setDepthPaint] = useState<{ dataUrl: string; name: string; mediaKind: "image" | "video" } | null>(null);
    const [quality, setQuality] = useState(0.8);
    const [maxWidthOrHeight, setMaxWidthOrHeight] = useState(1920);
    const [maxSizeMB, setMaxSizeMB] = useState(2);
    const [batchBusy, setBatchBusy] = useState(false);
    const [paintItem, setPaintItem] = useState<MediaItem | null>(null);
    const [paintDataUrl, setPaintDataUrl] = useState("");
    const compressInputRef = useRef<HTMLInputElement>(null);
    const pngInputRef = useRef<HTMLInputElement>(null);
    const meshInputRef = useRef<HTMLInputElement>(null);
    const flipInputRef = useRef<HTMLInputElement>(null);
    const portraitInputRef = useRef<HTMLInputElement>(null);
    const depthInputRef = useRef<HTMLInputElement>(null);

    const activeTitle =
        tool === "image-compress"
            ? t("canvas.tools.compress.title")
            : tool === "to-png"
              ? t("canvas.tools.toPng.title")
              : tool === "face-mesh"
                ? t("canvas.tools.faceMesh.title")
                : tool === "flip-upside-down"
                  ? t("canvas.tools.flipUpsideDown.title")
                  : tool === "portrait-style"
                    ? t("canvas.tools.portraitStyle.title")
                    : tool === "depth-video"
                      ? t("canvas.tools.depthVideo.title")
                      : t("canvas.tools.title");

    const closeDrawer = () => {
        onOpenChange(false);
        setTool("home");
    };

    const addFiles = (files: FileList | File[], setter: typeof setCompressItems) => {
        const next: MediaItem[] = [];
        for (const file of Array.from(files)) {
            if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name)) {
                continue;
            }
            next.push({
                id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                source: file,
                previewUrl: URL.createObjectURL(file),
                sourceBytes: file.size,
            });
        }
        if (!next.length) {
            message.warning(t("canvas.tools.compress.imagesOnly"));
            return;
        }
        setter((current) => [...current, ...next]);
    };

    const removeItem = (id: string, items: MediaItem[], setter: typeof setCompressItems) => {
        const target = items.find((item) => item.id === id);
        if (target) {
            URL.revokeObjectURL(target.previewUrl);
            if (target.resultPreviewUrl) URL.revokeObjectURL(target.resultPreviewUrl);
        }
        setter((current) => current.filter((item) => item.id !== id));
    };

    const clearList = (items: MediaItem[], setter: typeof setCompressItems) => {
        revokeItems(items);
        setter([]);
    };

    const compressOne = async (item: MediaItem): Promise<MediaItem> => {
        try {
            const result = await imageCompression(item.source, {
                maxSizeMB: Math.max(0.1, maxSizeMB),
                maxWidthOrHeight: Math.max(256, maxWidthOrHeight),
                useWebWorker: true,
                initialQuality: Math.min(1, Math.max(0.1, quality)),
                fileType: item.source.type.includes("png") ? "image/png" : undefined,
            });
            if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
            return {
                ...item,
                result,
                resultPreviewUrl: URL.createObjectURL(result),
                error: undefined,
                busy: false,
            };
        } catch (error) {
            return {
                ...item,
                error: error instanceof Error ? error.message : String(error),
                busy: false,
            };
        }
    };

    const toPngOne = async (item: MediaItem): Promise<MediaItem> => {
        try {
            const result = await convertFileToPng(item.source);
            if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
            return {
                ...item,
                result,
                resultPreviewUrl: URL.createObjectURL(result),
                error: undefined,
                busy: false,
            };
        } catch (error) {
            return {
                ...item,
                error: error instanceof Error ? error.message : String(error),
                busy: false,
            };
        }
    };

    const flipUpsideDownOne = async (item: MediaItem): Promise<MediaItem> => {
        try {
            const sourceDataUrl = await fileToDataUrl(item.source);
            const flippedDataUrl = await rotateFlipDataUrl(sourceDataUrl, { rotate: 180 });
            const result = await dataUrlToPngFile(flippedDataUrl, item.name, "upside-down");
            if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
            return {
                ...item,
                result,
                resultPreviewUrl: URL.createObjectURL(result),
                error: undefined,
                busy: false,
            };
        } catch (error) {
            return {
                ...item,
                error: error instanceof Error ? error.message : String(error),
                busy: false,
            };
        }
    };

    const openPortraitStyle = async (item: MediaItem) => {
        try {
            const dataUrl = await fileToDataUrl(item.source);
            setPortraitPaint({ dataUrl, name: item.name });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const openDepthVideo = async (item: MediaItem) => {
        try {
            const dataUrl = await fileToDataUrl(item.source);
            const mediaKind: "image" | "video" = item.source.type.startsWith("video/") ? "video" : "image";
            setDepthPaint({ dataUrl, name: item.name, mediaKind });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const addDepthFiles = (files: FileList | File[]) => {
        const next: MediaItem[] = [];
        for (const file of Array.from(files)) {
            const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
            const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
            if (!isImage && !isVideo) continue;
            next.push({
                id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                source: file,
                previewUrl: URL.createObjectURL(file),
                sourceBytes: file.size,
            });
        }
        if (!next.length) {
            message.warning(t("canvas.tools.depthVideo.mediaOnly"));
            return;
        }
        setDepthItems((current) => [...current, ...next]);
    };

    const openFaceMeshPaint = async (item: MediaItem) => {
        try {
            const dataUrl = await fileToDataUrl(item.source);
            setPaintItem(item);
            setPaintDataUrl(dataUrl);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const confirmFaceMeshPaint = async (resultDataUrl: string) => {
        if (!paintItem) return;
        try {
            const result = await dataUrlToPngFile(resultDataUrl, paintItem.name);
            setMeshItems((current) =>
                current.map((item) => {
                    if (item.id !== paintItem.id) return item;
                    if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
                    return {
                        ...item,
                        result,
                        resultPreviewUrl: URL.createObjectURL(result),
                        error: undefined,
                        busy: false,
                    };
                }),
            );
            setPaintItem(null);
            setPaintDataUrl("");
            message.success(t("canvas.tools.faceMesh.done", { count: 1 }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const runBatch = async (
        items: MediaItem[],
        setter: typeof setCompressItems,
        worker: (item: MediaItem) => Promise<MediaItem>,
        doneKey: string,
    ) => {
        if (!items.length || batchBusy) return;
        setBatchBusy(true);
        setter((current) => current.map((item) => ({ ...item, busy: true, error: undefined })));
        const results: MediaItem[] = [];
        for (const item of items) {
            results.push(await worker(item));
            setter([...results, ...items.slice(results.length).map((pending) => ({ ...pending, busy: true }))]);
        }
        setter(results);
        setBatchBusy(false);
        const ok = results.filter((item) => item.result).length;
        if (ok) message.success(t(doneKey, { count: ok }));
    };


    const downloadOne = (item: MediaItem, mode: "compress" | "png" | "mesh" | "flip") => {
        if (!item.result) return;
        const filename =
            mode === "png"
                ? `${baseName(item.name)}.png`
                : mode === "mesh"
                  ? `${baseName(item.name)}-mesh.png`
                  : mode === "flip"
                    ? `${baseName(item.name)}-upside-down.png`
                    : compressedFilename(item.name, item.result.type || item.source.type);
        downloadBlob(item.result, filename);
    };

    return (
        <>
            <Drawer
                title={null}
                open={open}
                onClose={closeDrawer}
                placement="right"
                size={400}
                destroyOnClose={false}
                styles={{
                    header: { display: "none" },
                    body: {
                        padding: 0,
                        background: colorTheme === "dark" ? "#1a1f2a" : "#f4f7fc",
                        color: theme.node.text,
                    },
                    wrapper: { boxShadow: colorTheme === "dark" ? "0 0 48px rgba(0,0,0,.45)" : "0 0 48px rgba(15,23,42,.12)" },
                }}
            >
                <div className="flex h-full flex-col">
                    <div
                        className="flex shrink-0 items-center gap-2 border-b px-4 py-3.5"
                        style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}
                    >
                        {tool !== "home" ? (
                            <button
                                type="button"
                                className="grid size-8 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
                                style={{ color: theme.node.muted }}
                                onClick={() => setTool("home")}
                                aria-label={t("canvas.tools.title")}
                            >
                                <ArrowLeft className="size-4" />
                            </button>
                        ) : (
                            <span
                                className="grid size-8 place-items-center rounded-lg"
                                style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                            >
                                <Wand2 className="size-4" />
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold" style={{ color: theme.node.text }}>
                                {activeTitle}
                            </div>
                            {tool === "home" ? (
                                <div className="mt-0.5 truncate text-xs" style={{ color: theme.node.muted }}>
                                    {t("canvas.tools.subtitle")}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {tool === "home" ? (
                    <div className="grid gap-4">
                        <ToolSection theme={theme} label={t("canvas.tools.sectionLocal")}>
                            <ToolCard
                                theme={theme}
                                icon={<ImageIcon className="size-4" />}
                                title={t("canvas.tools.compress.title")}
                                description={t("canvas.tools.compress.description")}
                                onClick={() => setTool("image-compress")}
                            />
                            <ToolCard
                                theme={theme}
                                icon={<FileImage className="size-4" />}
                                title={t("canvas.tools.toPng.title")}
                                description={t("canvas.tools.toPng.description")}
                                onClick={() => setTool("to-png")}
                            />
                            <ToolCard
                                theme={theme}
                                icon={<ScanFace className="size-4" />}
                                title={t("canvas.tools.faceMesh.title")}
                                description={t("canvas.tools.faceMesh.description")}
                                onClick={() => setTool("face-mesh")}
                            />
                            <ToolCard
                                theme={theme}
                                icon={<FlipVertical2 className="size-4" />}
                                title={t("canvas.tools.flipUpsideDown.title")}
                                description={t("canvas.tools.flipUpsideDown.description")}
                                onClick={() => setTool("flip-upside-down")}
                            />
                        </ToolSection>
                        <ToolSection theme={theme} label={t("canvas.tools.sectionAi")}>
                            <ToolCard
                                theme={theme}
                                icon={<Palette className="size-4" />}
                                title={t("canvas.tools.portraitStyle.title")}
                                description={t("canvas.tools.portraitStyle.description")}
                                onClick={() => setTool("portrait-style")}
                            />
                            <ToolCard
                                theme={theme}
                                icon={<Clapperboard className="size-4" />}
                                title={t("canvas.tools.depthVideo.title")}
                                description={t("canvas.tools.depthVideo.description")}
                                onClick={() => setTool("depth-video")}
                            />
                        </ToolSection>
                    </div>
                ) : null}

                {tool === "image-compress" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={compressItems}
                        batchBusy={batchBusy}
                        inputRef={compressInputRef}
                        settings={
                            <div className="grid gap-3 rounded-xl border p-3.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                                <label className="block text-xs font-medium" style={{ color: theme.node.muted }}>
                                    {t("canvas.tools.compress.quality")}
                                    <span className="ml-2 tabular-nums" style={{ color: theme.node.text }}>{Math.round(quality * 100)}%</span>
                                </label>
                                <Slider
                                    min={10}
                                    max={100}
                                    step={5}
                                    value={Math.round(quality * 100)}
                                    onChange={(value) => setQuality((Array.isArray(value) ? value[0] : value) / 100)}
                                    tooltip={{ formatter: (value) => `${value}%` }}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block text-xs font-medium" style={{ color: theme.node.muted }}>
                                        {t("canvas.tools.compress.maxEdge")}
                                        <InputNumber
                                            className="mt-1.5 !w-full"
                                            min={256}
                                            max={8192}
                                            step={64}
                                            value={maxWidthOrHeight}
                                            onChange={(value) => setMaxWidthOrHeight(Number(value) || 1920)}
                                        />
                                    </label>
                                    <label className="block text-xs font-medium" style={{ color: theme.node.muted }}>
                                        {t("canvas.tools.compress.maxSizeMb")}
                                        <InputNumber
                                            className="mt-1.5 !w-full"
                                            min={0.1}
                                            max={40}
                                            step={0.1}
                                            value={maxSizeMB}
                                            onChange={(value) => setMaxSizeMB(Number(value) || 2)}
                                        />
                                    </label>
                                </div>
                                <Typography.Paragraph className="!mb-0 !text-xs" style={{ color: theme.node.faint }}>{t("canvas.tools.compress.hint")}</Typography.Paragraph>
                            </div>
                        }
                        addLabel={t("canvas.tools.compress.addImages")}
                        runLabel={t("canvas.tools.compress.run")}
                        downloadAllLabel={t("canvas.tools.compress.downloadAll")}
                        clearLabel={t("canvas.tools.compress.clear")}
                        dropHint={t("canvas.tools.compress.dropHint")}
                        workingLabel={t("canvas.tools.compress.working")}
                        downloadLabel={t("canvas.tools.compress.download")}
                        onAdd={() => compressInputRef.current?.click()}
                        onRun={() => void runBatch(compressItems, setCompressItems, compressOne, "canvas.tools.compress.done")}
                        onDownloadAll={() => compressItems.forEach((item) => downloadOne(item, "compress"))}
                        onClear={() => clearList(compressItems, setCompressItems)}
                        onRemove={(id) => removeItem(id, compressItems, setCompressItems)}
                        onDownload={(item) => downloadOne(item, "compress")}
                        onFiles={(files) => addFiles(files, setCompressItems)}
                        sizeDeltaMode="shrink"
                    />
                ) : null}

                {tool === "to-png" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={pngItems}
                        batchBusy={batchBusy}
                        inputRef={pngInputRef}
                        settings={
                            <Typography.Paragraph className="!mb-0 rounded-xl border p-3.5 !text-xs" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.muted }}>
                                {t("canvas.tools.toPng.hint")}
                            </Typography.Paragraph>
                        }
                        addLabel={t("canvas.tools.toPng.addImages")}
                        runLabel={t("canvas.tools.toPng.run")}
                        downloadAllLabel={t("canvas.tools.toPng.downloadAll")}
                        clearLabel={t("canvas.tools.compress.clear")}
                        dropHint={t("canvas.tools.toPng.dropHint")}
                        workingLabel={t("canvas.tools.toPng.working")}
                        downloadLabel={t("canvas.tools.compress.download")}
                        onAdd={() => pngInputRef.current?.click()}
                        onRun={() => void runBatch(pngItems, setPngItems, toPngOne, "canvas.tools.toPng.done")}
                        onDownloadAll={() => pngItems.forEach((item) => downloadOne(item, "png"))}
                        onClear={() => clearList(pngItems, setPngItems)}
                        onRemove={(id) => removeItem(id, pngItems, setPngItems)}
                        onDownload={(item) => downloadOne(item, "png")}
                        onFiles={(files) => addFiles(files, setPngItems)}
                        sizeDeltaMode="any"
                    />
                ) : null}

                {tool === "face-mesh" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={meshItems}
                        batchBusy={batchBusy}
                        inputRef={meshInputRef}
                        settings={
                            <Typography.Paragraph className="!mb-0 rounded-xl border p-3.5 !text-xs" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.muted }}>
                                {t("canvas.tools.faceMesh.hint")}
                            </Typography.Paragraph>
                        }
                        addLabel={t("canvas.tools.faceMesh.addImages")}
                        runLabel={t("canvas.tools.faceMesh.run")}
                        downloadAllLabel={t("canvas.tools.faceMesh.downloadAll")}
                        clearLabel={t("canvas.tools.compress.clear")}
                        dropHint={t("canvas.tools.faceMesh.dropHint")}
                        workingLabel={t("canvas.tools.faceMesh.working")}
                        downloadLabel={t("canvas.tools.compress.download")}
                        itemActionLabel={t("canvas.tools.faceMesh.paint")}
                        onItemAction={(item) => void openFaceMeshPaint(item)}
                        onAdd={() => meshInputRef.current?.click()}
                        onRun={() => {
                            const pending = meshItems.find((item) => !item.result) || meshItems[0];
                            if (pending) void openFaceMeshPaint(pending);
                        }}
                        onDownloadAll={() => meshItems.forEach((item) => downloadOne(item, "mesh"))}
                        onClear={() => clearList(meshItems, setMeshItems)}
                        onRemove={(id) => removeItem(id, meshItems, setMeshItems)}
                        onDownload={(item) => downloadOne(item, "mesh")}
                        onFiles={(files) => addFiles(files, setMeshItems)}
                        sizeDeltaMode="any"
                    />
                ) : null}

                {tool === "flip-upside-down" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={flipItems}
                        batchBusy={batchBusy}
                        inputRef={flipInputRef}
                        settings={
                            <Typography.Paragraph className="!mb-0 rounded-xl border p-3.5 !text-xs" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.muted }}>
                                {t("canvas.tools.flipUpsideDown.hint")}
                            </Typography.Paragraph>
                        }
                        addLabel={t("canvas.tools.flipUpsideDown.addImages")}
                        runLabel={t("canvas.tools.flipUpsideDown.run")}
                        downloadAllLabel={t("canvas.tools.flipUpsideDown.downloadAll")}
                        clearLabel={t("canvas.tools.compress.clear")}
                        dropHint={t("canvas.tools.flipUpsideDown.dropHint")}
                        workingLabel={t("canvas.tools.flipUpsideDown.working")}
                        downloadLabel={t("canvas.tools.compress.download")}
                        onAdd={() => flipInputRef.current?.click()}
                        onRun={() => void runBatch(flipItems, setFlipItems, flipUpsideDownOne, "canvas.tools.flipUpsideDown.done")}
                        onDownloadAll={() => flipItems.forEach((item) => downloadOne(item, "flip"))}
                        onClear={() => clearList(flipItems, setFlipItems)}
                        onRemove={(id) => removeItem(id, flipItems, setFlipItems)}
                        onDownload={(item) => downloadOne(item, "flip")}
                        onFiles={(files) => addFiles(files, setFlipItems)}
                        sizeDeltaMode="any"
                    />
                ) : null}

                {tool === "portrait-style" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={portraitItems}
                        batchBusy={batchBusy}
                        inputRef={portraitInputRef}
                        settings={
                            <Typography.Paragraph className="!mb-0 rounded-xl border p-3.5 !text-xs" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.muted }}>
                                {t("canvas.tools.portraitStyle.hint")}
                            </Typography.Paragraph>
                        }
                        addLabel={t("canvas.tools.portraitStyle.addImages")}
                        runLabel={t("canvas.tools.portraitStyle.run")}
                        downloadAllLabel={t("canvas.tools.compress.download")}
                        clearLabel={t("canvas.tools.compress.clear")}
                        dropHint={t("canvas.tools.portraitStyle.dropHint")}
                        workingLabel={t("canvas.tools.portraitStyle.working")}
                        downloadLabel={t("canvas.tools.compress.download")}
                        itemActionLabel={t("canvas.tools.portraitStyle.convert")}
                        onItemAction={(item) => void openPortraitStyle(item)}
                        onAdd={() => portraitInputRef.current?.click()}
                        onRun={() => {
                            const pending = portraitItems.find((item) => !item.result) || portraitItems[0];
                            if (pending) void openPortraitStyle(pending);
                        }}
                        onDownloadAll={() => {}}
                        onClear={() => clearList(portraitItems, setPortraitItems)}
                        onRemove={(id) => removeItem(id, portraitItems, setPortraitItems)}
                        onDownload={() => {}}
                        onFiles={(files) => addFiles(files, setPortraitItems)}
                        sizeDeltaMode="any"
                    />
                ) : null}

                {tool === "depth-video" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={depthItems}
                        batchBusy={batchBusy}
                        inputRef={depthInputRef}
                        settings={
                            <Typography.Paragraph className="!mb-0 rounded-xl border p-3.5 !text-xs" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.muted }}>
                                {t("canvas.tools.depthVideo.hint")}
                            </Typography.Paragraph>
                        }
                        addLabel={t("canvas.tools.depthVideo.addMedia")}
                        runLabel={t("canvas.tools.depthVideo.run")}
                        downloadAllLabel={t("canvas.tools.compress.download")}
                        clearLabel={t("canvas.tools.compress.clear")}
                        dropHint={t("canvas.tools.depthVideo.dropHint")}
                        workingLabel={t("canvas.tools.depthVideo.working")}
                        downloadLabel={t("canvas.tools.compress.download")}
                        itemActionLabel={t("canvas.tools.depthVideo.convert")}
                        onItemAction={(item) => void openDepthVideo(item)}
                        onAdd={() => depthInputRef.current?.click()}
                        onRun={() => {
                            const pending = depthItems.find((item) => !item.result) || depthItems[0];
                            if (pending) void openDepthVideo(pending);
                        }}
                        onDownloadAll={() => {}}
                        onClear={() => clearList(depthItems, setDepthItems)}
                        onRemove={(id) => removeItem(id, depthItems, setDepthItems)}
                        onDownload={() => {}}
                        onFiles={(files) => addDepthFiles(files)}
                        sizeDeltaMode="any"
                        accept="image/*,video/*"
                    />
                ) : null}

                    </div>
                </div>
            </Drawer>

            {paintItem && paintDataUrl ? (
                <CanvasNodeFaceMeshDialog
                    dataUrl={paintDataUrl}
                    open={Boolean(paintItem)}
                    onClose={() => {
                        setPaintItem(null);
                        setPaintDataUrl("");
                    }}
                    onConfirm={(result) => void confirmFaceMeshPaint(result)}
                />
            ) : null}

            {portraitPaint ? (
                <CanvasNodePortraitStyleDialog
                    dataUrl={portraitPaint.dataUrl}
                    open={Boolean(portraitPaint)}
                    onClose={() => setPortraitPaint(null)}
                    onConfirm={(payload: CanvasPortraitStyleConfirm) => {
                        const pending = portraitPaint;
                        setPortraitPaint(null);
                        void (async () => {
                            try {
                                await onApplyPortraitStyle?.({
                                    dataUrl: pending.dataUrl,
                                    fileName: pending.name,
                                    style: payload.style,
                                    model: payload.model,
                                    prompt: payload.prompt,
                                });
                                message.success(t("canvas.tools.portraitStyle.started"));
                                onOpenChange(false);
                                setTool("home");
                            } catch (error) {
                                message.error(error instanceof Error ? error.message : t("canvas.tools.portraitStyle.failed"));
                            }
                        })();
                    }}
                />
            ) : null}

            {depthPaint ? (
                <CanvasNodeDepthVideoDialog
                    previewUrl={depthPaint.dataUrl}
                    mediaKind={depthPaint.mediaKind}
                    open={Boolean(depthPaint)}
                    onClose={() => setDepthPaint(null)}
                    onConfirm={(payload: CanvasDepthVideoConfirm) => {
                        const pending = depthPaint;
                        setDepthPaint(null);
                        void (async () => {
                            try {
                                await onApplyDepthVideo?.({
                                    dataUrl: pending.dataUrl,
                                    mediaKind: pending.mediaKind,
                                    fileName: pending.name,
                                    model: payload.model,
                                    prompt: payload.prompt,
                                });
                                message.success(t("canvas.tools.depthVideo.started"));
                                onOpenChange(false);
                                setTool("home");
                            } catch (error) {
                                message.error(error instanceof Error ? error.message : t("canvas.tools.depthVideo.failed"));
                            }
                        })();
                    }}
                />
            ) : null}
        </>
    );
}

function ToolSection({
    theme,
    label,
    children,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <div className="px-0.5 text-[11px] font-medium tracking-wide opacity-55" style={{ color: theme.node.muted }}>
                {label}
            </div>
            {children}
        </div>
    );
}

function ToolCard({
    theme,
    icon,
    title,
    description,
    onClick,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    icon: ReactNode;
    title: string;
    description: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition hover:border-transparent"
            style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel, color: theme.node.text } as CSSProperties}
            onClick={onClick}
            onMouseEnter={(event) => {
                event.currentTarget.style.background = theme.toolbar.itemHover;
            }}
            onMouseLeave={(event) => {
                event.currentTarget.style.background = theme.toolbar.panel;
            }}
        >
            <span
                className="grid size-9 shrink-0 place-items-center rounded-lg"
                style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-5">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-4" style={{ color: theme.node.muted }}>
                    {description}
                </span>
            </span>
            <ChevronRight className="size-4 shrink-0 opacity-35 transition group-hover:opacity-70" style={{ color: theme.node.muted }} />
        </button>
    );
}

function ToolWorkspace({
    theme,
    items,
    batchBusy,
    inputRef,
    settings,
    addLabel,
    runLabel,
    downloadAllLabel,
    clearLabel,
    dropHint,
    workingLabel,
    downloadLabel,
    itemActionLabel,
    onItemAction,
    onAdd,
    onRun,
    onDownloadAll,
    onClear,
    onRemove,
    onDownload,
    onFiles,
    sizeDeltaMode,
    accept = "image/*",
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    items: MediaItem[];
    batchBusy: boolean;
    inputRef: RefObject<HTMLInputElement | null>;
    settings: ReactNode;
    addLabel: string;
    runLabel: string;
    downloadAllLabel: string;
    clearLabel: string;
    dropHint: string;
    workingLabel: string;
    downloadLabel: string;
    itemActionLabel?: string;
    onItemAction?: (item: MediaItem) => void;
    onAdd: () => void;
    onRun: () => void;
    onDownloadAll: () => void;
    onClear: () => void;
    onRemove: (id: string) => void;
    onDownload: (item: MediaItem) => void;
    onFiles: (files: FileList) => void;
    sizeDeltaMode: "shrink" | "any";
    accept?: string;
}) {
    const { t } = useTranslation();
    const doneCount = useMemo(() => items.filter((item) => item.result).length, [items]);

    return (
        <div className="flex h-full flex-col gap-4">
            {settings}
            <div className="flex flex-wrap gap-2">
                <Button type="primary" onClick={onAdd}>
                    {addLabel}
                </Button>
                <Button disabled={!items.length || batchBusy} loading={batchBusy} onClick={onRun}>
                    {runLabel}
                </Button>
                <Button disabled={!doneCount} icon={<Download className="size-3.5" />} onClick={onDownloadAll}>
                    {downloadAllLabel}
                </Button>
                <Button disabled={!items.length || batchBusy} danger onClick={onClear}>
                    {clearLabel}
                </Button>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={(event) => {
                    if (event.target.files?.length) onFiles(event.target.files);
                    event.target.value = "";
                }}
            />

            <div
                className={cn(
                    "thin-scrollbar min-h-40 flex-1 space-y-2 overflow-y-auto rounded-xl border border-dashed p-2",
                    !items.length && "grid place-items-center",
                )}
                style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}
                onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.dataTransfer.files?.length) onFiles(event.dataTransfer.files);
                }}
            >
                {!items.length ? (
                    <p className="m-0 px-4 text-center text-sm" style={{ color: theme.node.muted }}>{dropHint}</p>
                ) : (
                    items.map((item) => {
                        const ratio =
                            item.result && item.sourceBytes > 0
                                ? Math.round((1 - item.result.size / item.sourceBytes) * 100)
                                : null;
                        const ratioLabel =
                            ratio == null
                                ? ""
                                : sizeDeltaMode === "shrink"
                                  ? ` · -${Math.max(0, ratio)}%`
                                  : ratio >= 0
                                    ? ` · -${ratio}%`
                                    : ` · +${Math.abs(ratio)}%`;
                        return (
                            <div
                                key={item.id}
                                className="flex gap-3 rounded-lg border p-2"
                                style={{ borderColor: theme.toolbar.border, background: theme.node.panel, color: theme.node.text }}
                            >
                                <img src={item.resultPreviewUrl || item.previewUrl} alt={item.name} className="size-16 shrink-0 rounded-md object-cover" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{item.name}</div>
                                    <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>
                                        {formatBytes(item.sourceBytes)}
                                        {item.result ? ` → ${formatBytes(item.result.size)}` : ""}
                                        {item.result ? ` · ${item.result.type || "image/png"}` : ""}
                                        {ratioLabel}
                                    </div>
                                    {item.error ? <div className="mt-1 text-xs text-red-500">{item.error}</div> : null}
                                    {item.busy ? (
                                        <div className="mt-1 inline-flex items-center gap-1 text-xs" style={{ color: theme.node.muted }}>
                                            <Loader2 className="size-3 animate-spin" />
                                            {workingLabel}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex shrink-0 flex-col gap-1">
                                    {onItemAction && itemActionLabel ? (
                                        <Tooltip title={itemActionLabel}>
                                            <Button
                                                type="text"
                                                size="small"
                                                disabled={batchBusy}
                                                icon={<Brush className="size-3.5" />}
                                                onClick={() => onItemAction(item)}
                                                aria-label={itemActionLabel}
                                            />
                                        </Tooltip>
                                    ) : null}
                                    <Button
                                        type="text"
                                        size="small"
                                        disabled={!item.result}
                                        icon={<Download className="size-3.5" />}
                                        onClick={() => onDownload(item)}
                                        aria-label={downloadLabel}
                                    />
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        disabled={batchBusy}
                                        icon={<Trash2 className="size-3.5" />}
                                        onClick={() => onRemove(item.id)}
                                        aria-label={t("common.delete")}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
