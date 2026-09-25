import imageCompression from "browser-image-compression";
import { ArrowLeft, Download, FileImage, ImageIcon, Loader2, Trash2, Wrench } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { App, Button, Drawer, InputNumber, Slider, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { cn } from "@canvas/lib/utils";
import { SmartImage } from "@/components/smart-image";

type ToolId = "home" | "image-compress" | "to-png";

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

function revokeItems(items: MediaItem[]) {
    for (const item of items) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.resultPreviewUrl) URL.revokeObjectURL(item.resultPreviewUrl);
    }
}

export function CanvasToolsDrawer() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [open, setOpen] = useState(false);
    const [tool, setTool] = useState<ToolId>("home");
    const [compressItems, setCompressItems] = useState<MediaItem[]>([]);
    const [pngItems, setPngItems] = useState<MediaItem[]>([]);
    const [quality, setQuality] = useState(0.8);
    const [maxWidthOrHeight, setMaxWidthOrHeight] = useState(1920);
    const [maxSizeMB, setMaxSizeMB] = useState(2);
    const [batchBusy, setBatchBusy] = useState(false);
    const compressInputRef = useRef<HTMLInputElement>(null);
    const pngInputRef = useRef<HTMLInputElement>(null);

    const dockStyle = {
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
        color: theme.toolbar.item,
        boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)",
    };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    const activeTitle =
        tool === "image-compress"
            ? t("canvas.tools.compress.title")
            : tool === "to-png"
              ? t("canvas.tools.toPng.title")
              : t("canvas.tools.title");

    const closeDrawer = () => {
        setOpen(false);
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

    const downloadOne = (item: MediaItem, asPng: boolean) => {
        if (!item.result) return;
        const filename = asPng
            ? `${baseName(item.name)}.png`
            : compressedFilename(item.name, item.result.type || item.source.type);
        downloadBlob(item.result, filename);
    };

    return (
        <div
            className="absolute bottom-5 right-5 z-50"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <Tooltip title={t("canvas.tools.open")} placement="left">
                <button
                    type="button"
                    data-tour="canvas-tools-fab"
                    className="flex h-14 w-14 items-center justify-center rounded-full border shadow-lg backdrop-blur transition hover:scale-[1.03]"
                    style={open ? { ...dockStyle, ...activeStyle } : dockStyle}
                    onClick={() => setOpen(true)}
                    aria-label={t("canvas.tools.open")}
                >
                    <Wrench className="size-5" />
                </button>
            </Tooltip>

            <Drawer
                title={
                    tool === "home" ? (
                        t("canvas.tools.title")
                    ) : (
                        <button type="button" className="inline-flex items-center gap-2 text-left font-medium" onClick={() => setTool("home")}>
                            <ArrowLeft className="size-4 opacity-70" />
                            {activeTitle}
                        </button>
                    )
                }
                open={open}
                onClose={closeDrawer}
                placement="right"
                size={440}
                destroyOnHidden={false}
                styles={{ body: { paddingTop: 12 } }}
            >
                {tool === "home" ? (
                    <div className="grid gap-3">
                        <p className="m-0 text-sm opacity-60">{t("canvas.tools.subtitle")}</p>
                        <ToolCard
                            theme={theme}
                            icon={<ImageIcon className="size-5" />}
                            title={t("canvas.tools.compress.title")}
                            description={t("canvas.tools.compress.description")}
                            onClick={() => setTool("image-compress")}
                        />
                        <ToolCard
                            theme={theme}
                            icon={<FileImage className="size-5" />}
                            title={t("canvas.tools.toPng.title")}
                            description={t("canvas.tools.toPng.description")}
                            onClick={() => setTool("to-png")}
                        />
                    </div>
                ) : null}

                {tool === "image-compress" ? (
                    <ToolWorkspace
                        theme={theme}
                        items={compressItems}
                        batchBusy={batchBusy}
                        inputRef={compressInputRef}
                        settings={
                            <div className="grid gap-3 rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}>
                                <label className="block text-xs font-medium opacity-60">
                                    {t("canvas.tools.compress.quality")}
                                    <span className="ml-2 tabular-nums opacity-80">{Math.round(quality * 100)}%</span>
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
                                    <label className="block text-xs font-medium opacity-60">
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
                                    <label className="block text-xs font-medium opacity-60">
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
                                <Typography.Paragraph className="!mb-0 !text-xs opacity-50">{t("canvas.tools.compress.hint")}</Typography.Paragraph>
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
                        onDownloadAll={() => compressItems.forEach((item) => downloadOne(item, false))}
                        onClear={() => clearList(compressItems, setCompressItems)}
                        onRemove={(id) => removeItem(id, compressItems, setCompressItems)}
                        onDownload={(item) => downloadOne(item, false)}
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
                            <Typography.Paragraph className="!mb-0 rounded-xl border p-3 !text-xs opacity-60" style={{ borderColor: theme.toolbar.border }}>
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
                        onDownloadAll={() => pngItems.forEach((item) => downloadOne(item, true))}
                        onClear={() => clearList(pngItems, setPngItems)}
                        onRemove={(id) => removeItem(id, pngItems, setPngItems)}
                        onDownload={(item) => downloadOne(item, true)}
                        onFiles={(files) => addFiles(files, setPngItems)}
                        sizeDeltaMode="any"
                    />
                ) : null}
            </Drawer>
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
            className="flex w-full items-start gap-3 rounded-xl border px-3.5 py-3.5 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
            onClick={onClick}
        >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: theme.toolbar.itemHover }}>
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-1 block text-xs opacity-60">{description}</span>
            </span>
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
    onAdd,
    onRun,
    onDownloadAll,
    onClear,
    onRemove,
    onDownload,
    onFiles,
    sizeDeltaMode,
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
    onAdd: () => void;
    onRun: () => void;
    onDownloadAll: () => void;
    onClear: () => void;
    onRemove: (id: string) => void;
    onDownload: (item: MediaItem) => void;
    onFiles: (files: FileList) => void;
    sizeDeltaMode: "shrink" | "any";
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
                accept="image/*"
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
                style={{ borderColor: theme.toolbar.border }}
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
                    <p className="m-0 px-4 text-center text-sm opacity-50">{dropHint}</p>
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
                                style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}
                            >
                                <SmartImage src={item.resultPreviewUrl || item.previewUrl} alt={item.name} className="size-16 shrink-0 rounded-md object-cover" fallbackIconClassName="size-4" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{item.name}</div>
                                    <div className="mt-1 text-xs opacity-60">
                                        {formatBytes(item.sourceBytes)}
                                        {item.result ? ` → ${formatBytes(item.result.size)}` : ""}
                                        {item.result ? ` · ${item.result.type || "image/png"}` : ""}
                                        {ratioLabel}
                                    </div>
                                    {item.error ? <div className="mt-1 text-xs text-red-500">{item.error}</div> : null}
                                    {item.busy ? (
                                        <div className="mt-1 inline-flex items-center gap-1 text-xs opacity-60">
                                            <Loader2 className="size-3 animate-spin" />
                                            {workingLabel}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex shrink-0 flex-col gap-1">
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
