import { memo, useEffect, useMemo, useState } from "react";
import { App, Checkbox, Drawer, Empty, Input, Popconfirm, Spin, Tag } from "antd";
import { Download, Image as ImageIcon, LoaderCircle, Plus, Search, Trash2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CanvasTheme } from "@canvas/lib/canvas-theme";
import { saveBlobAs } from "@canvas/lib/save-file";
import { getImageBlob, setImageBlob, uploadImage } from "@canvas/services/image-storage";
import { getMediaBlob, setMediaBlob, uploadMediaFile } from "@canvas/services/file-storage";
import { isTauri } from "@canvas/services/fs-store";
import { cn } from "@canvas/lib/utils";
import {
    deleteGenerationAssetsByClientIds,
    type GenerationAsset,
    type GenerationAssetFile,
    type GenerationAssetKind,
} from "@canvas/services/api/generation-assets";
import { summarizeMirrorStatus } from "@/features/generation-assets/mirror-status";
import { useGenerationLogsBadgeStore } from "@canvas/stores/use-generation-logs-badge-store";
import { isSignedUrlExpired } from "@canvas/lib/signed-url";
import { SmartImage } from "@/components/smart-image";

import type { InsertAssetPayload } from "./asset-picker-modal";

type KindFilter = "all" | GenerationAssetKind;

type Props = {
    onInsert: (payload: InsertAssetPayload) => void;
    theme: CanvasTheme;
};

function createdAtMs(value: number) {
    return value > 1e12 ? value : value * 1000;
}

function formatLogTime(value: number, locale?: string) {
    return new Date(createdAtMs(value)).toLocaleString(locale, { hour12: false });
}

function mediaFiles(asset: GenerationAsset) {
    const files = (asset.assets || []).filter((item) => Boolean(item.url?.trim() || item.storage_key));
    if (files.length <= 1) return files;
    // Videos (and accidental remirror stacks) should surface one preferred playable URL.
    if (asset.kind === "video") {
        return [preferMediaFile(files)];
    }
    return files;
}

function preferMediaFile(files: NonNullable<GenerationAsset["assets"]>) {
    const score = (file: (typeof files)[number]) => {
        let value = 0;
        const url = (file.url || "").toLowerCase();
        if (/^https?:\/\//.test(url)) value += 50;
        if (url.includes("/ailingecho/") || url.includes("/canvas/") || url.includes("/api/storage/")) value += 40;
        if (file.storage_key) value += 20;
        if (file.bytes) value += 5;
        if (file.width && file.height) value += 2;
        return value;
    };
    return files.reduce((best, file) => (score(file) > score(best) ? file : best), files[0]);
}

function logClientId(asset: GenerationAsset) {
    return asset.client_id?.trim() || `remote:${asset.id}`;
}

function safeDownloadName(value: string) {
    return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "generation";
}

function mediaExtension(file: GenerationAssetFile, kind: GenerationAssetKind) {
    const mime = (file.mime_type || "").toLowerCase();
    if (mime.includes("png")) return "png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
    const fromUrl = file.url?.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i)?.[1];
    if (fromUrl) return fromUrl.toLowerCase();
    return kind === "video" ? "mp4" : "png";
}

async function fetchMediaBlob(url: string): Promise<Blob> {
    if (isTauri()) {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        return (await tauriFetch(url)).blob();
    }
    return (await fetch(url)).blob();
}

/** A file is insertable when it has a local blob backup or a still-valid remote URL. */
function canInsertFile(file: GenerationAssetFile) {
    if (file.storage_key) return true;
    return Boolean(file.url && !isSignedUrlExpired(file.url));
}

async function readLocalBlob(storageKey: string): Promise<Blob | null> {
    const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey).catch(() => null) : await getMediaBlob(storageKey).catch(() => null);
    return blob?.size ? blob : null;
}

/** Local backup first, fresh remote URL second; heals the fetched bytes into the local key. */
async function resolveInsertBlob(file: GenerationAssetFile): Promise<Blob | null> {
    const storageKey = file.storage_key || "";
    if (storageKey) {
        const local = await readLocalBlob(storageKey);
        if (local) return local;
    }
    if (!file.url || isSignedUrlExpired(file.url)) return null;
    const blob = await fetchMediaBlob(file.url).catch(() => null);
    if (!blob?.size) return null;
    if (storageKey) {
        const store = storageKey.startsWith("image:") ? setImageBlob : setMediaBlob;
        void store(storageKey, blob).catch(() => undefined);
    }
    return blob;
}

async function downloadMediaFile(file: GenerationAssetFile, filename: string) {
    const url = file.url?.trim();
    if (!url) throw new Error("missing url");
    if (url.startsWith("data:") || url.startsWith("blob:")) {
        await saveBlobAs(url, filename);
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

export const CanvasGenerationLogsTab = memo(function CanvasGenerationLogsTab({ onInsert, theme }: Props) {
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();
    const items = useGenerationLogsBadgeStore((state) => state.items);
    const loading = useGenerationLogsBadgeStore((state) => state.loading);
    const loadingMore = useGenerationLogsBadgeStore((state) => state.loadingMore);
    const hasMore = useGenerationLogsBadgeStore((state) => state.hasMore);
    const refresh = useGenerationLogsBadgeStore((state) => state.refresh);
    const loadMore = useGenerationLogsBadgeStore((state) => state.loadMore);
    const markSeen = useGenerationLogsBadgeStore((state) => state.markSeen);
    const startWatching = useGenerationLogsBadgeStore((state) => state.startWatching);
    const stopWatching = useGenerationLogsBadgeStore((state) => state.stopWatching);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [preview, setPreview] = useState<GenerationAsset | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [inserting, setInserting] = useState(false);

    useEffect(() => {
        markSeen();
        startWatching();
        return () => stopWatching();
    }, [markSeen, startWatching, stopWatching]);

    useEffect(() => {
        markSeen();
    }, [items, markSeen]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return items
            .filter((item) => kindFilter === "all" || item.kind === kindFilter)
            .filter((item) => {
                if (!query) return true;
                return [item.title, item.prompt, item.model, item.source].filter(Boolean).join(" ").toLowerCase().includes(query);
            })
            .sort((a, b) => createdAtMs(b.created_at) - createdAtMs(a.created_at));
    }, [items, keyword, kindFilter]);

    const allSelected = Boolean(filtered.length) && filtered.every((item) => selectedIds.includes(logClientId(item)));

    const toggleAll = () => {
        setSelectedIds(allSelected ? [] : filtered.map(logClientId));
    };

    const toggleSelected = (id: string, checked: boolean) => {
        setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)));
    };

    const handleDeleteSelected = async () => {
        if (!selectedIds.length) return;
        const hide = message.loading(t("common.delete"), 0);
        try {
            await deleteGenerationAssetsByClientIds(selectedIds);
            await refresh();
            markSeen();
            setSelectedIds([]);
            if (preview && selectedIds.includes(logClientId(preview))) setPreview(null);
            message.success(t("canvas.sidePanel.logsDeleted", { count: selectedIds.length }));
        } catch {
            message.error(t("canvas.sidePanel.addFailed"));
        } finally {
            hide();
        }
    };

    const handleInsert = async (asset: GenerationAsset) => {
        const files = mediaFiles(asset);
        if (!files.length) {
            message.warning(t("canvas.sidePanel.cannotInsertLog"));
            return;
        }
        if (!files.some(canInsertFile)) {
            message.warning(t("canvas.sidePanel.cannotInsertExpired"));
            void refresh();
            return;
        }
        if (inserting) return;
        const title = asset.title || asset.prompt || t("workbench.untitled");
        const toastKey = `insert-log-${logClientId(asset)}`;
        const showProgress = (current: number, total: number) =>
            message.open({ key: toastKey, type: "loading", content: t("canvas.sidePanel.inserting", { current, total }), duration: 0 });
        setInserting(true);
        showProgress(0, files.length);
        try {
            let insertedCount = 0;
            if (asset.kind === "video") {
                const file = files.find(canInsertFile) || files[0];
                const blob = await resolveInsertBlob(file);
                if (!blob) throw new Error("empty");
                const stored = await uploadMediaFile(new File([blob], `${safeDownloadName(title)}.${mediaExtension(file, "video")}`, { type: blob.type || file.mime_type || "video/mp4" }), "video", { background: true });
                onInsert({
                    kind: "video",
                    url: stored.url,
                    storageKey: stored.storageKey,
                    title,
                    width: stored.width || file.width,
                    height: stored.height || file.height,
                });
                insertedCount = 1;
            } else {
                for (const [index, file] of files.entries()) {
                    showProgress(index + 1, files.length);
                    const blob = await resolveInsertBlob(file);
                    if (!blob) continue;
                    const stored = await uploadImage(new File([blob], `${safeDownloadName(title)}.${mediaExtension(file, "image")}`, { type: blob.type || file.mime_type || "image/png" }), { background: true });
                    onInsert({
                        kind: "image",
                        dataUrl: stored.url,
                        storageKey: stored.storageKey,
                        title: files.length > 1 ? `${title} ${index + 1}` : title,
                    });
                    insertedCount += 1;
                }
            }
            if (!insertedCount) throw new Error("empty");
            message.open({ key: toastKey, type: "success", content: t("canvas.sidePanel.inserted"), duration: 2 });
            if (insertedCount < files.length) message.warning(t("canvas.sidePanel.insertPartial", { count: files.length - insertedCount }));
        } catch (error) {
            console.error(error);
            message.open({ key: toastKey, type: "error", content: t("canvas.sidePanel.insertFailed"), duration: 3 });
        } finally {
            setInserting(false);
        }
    };

    const handleDownload = async (asset: GenerationAsset, onlyFile?: GenerationAssetFile) => {
        const files = onlyFile ? [onlyFile] : mediaFiles(asset);
        if (!files.length || !files[0]?.url) {
            message.warning(t("canvas.sidePanel.cannotDownloadLog"));
            return;
        }
        if (files.every((file) => isSignedUrlExpired(file.url))) {
            message.warning(t("canvas.sidePanel.mediaLinkExpired"));
            void refresh();
            return;
        }
        const base = safeDownloadName(asset.title || asset.prompt || t("workbench.untitled"));
        setDownloading(true);
        try {
            for (const [index, file] of files.entries()) {
                const ext = mediaExtension(file, asset.kind);
                const filename = files.length > 1 ? `${base}-${index + 1}.${ext}` : `${base}.${ext}`;
                await downloadMediaFile(file, filename);
            }
            message.info(t("canvas.sidePanel.logDownloadHint"));
        } catch {
            message.error(t("canvas.sidePanel.logDownloadFailed"));
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="px-3 pb-2 pt-1">
                <Input
                    size="small"
                    allowClear
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder={t("canvas.sidePanel.searchLogs")}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
                {(
                    [
                        { id: "all", label: t("common.all") },
                        { id: "image", label: t("canvas.sidePanel.filter.image") },
                        { id: "video", label: t("canvas.sidePanel.filter.video") },
                    ] as const
                ).map((option) => (
                    <Tag.CheckableTag
                        key={option.id}
                        checked={kindFilter === option.id}
                        className={cn("prompt-filter-tag", kindFilter === option.id && "is-active")}
                        onChange={() => setKindFilter(option.id)}
                    >
                        {option.label}
                    </Tag.CheckableTag>
                ))}
                <div className="ml-auto flex items-center gap-1">
                    <button
                        type="button"
                        disabled={!filtered.length}
                        onClick={toggleAll}
                        className="rounded-md px-1.5 py-1 text-[11px] font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 disabled:opacity-30 dark:hover:bg-white/10"
                    >
                        {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                    </button>
                    <Popconfirm
                        title={t("workbench.deleteLogsConfirm", { count: selectedIds.length })}
                        okText={t("common.delete")}
                        cancelText={t("common.cancel")}
                        okButtonProps={{ danger: true }}
                        disabled={!selectedIds.length}
                        onConfirm={() => void handleDeleteSelected()}
                    >
                        <button
                            type="button"
                            disabled={!selectedIds.length}
                            className="grid size-7 place-items-center rounded-md text-red-500 opacity-80 transition hover:bg-red-500/10 hover:opacity-100 disabled:opacity-30"
                            aria-label={t("workbench.deleteLogs")}
                            title={t("workbench.deleteLogs")}
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    </Popconfirm>
                </div>
            </div>
            <div
                className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
                onScroll={(event) => {
                    const el = event.currentTarget;
                    if (!hasMore || loadingMore || loading) return;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 96) void loadMore();
                }}
            >
                {loading && !items.length ? (
                    <div className="flex justify-center py-16">
                        <Spin size="small" />
                    </div>
                ) : filtered.length ? (
                    <div className="space-y-1.5">
                        {filtered.map((asset) => {
                            const id = logClientId(asset);
                            return (
                                <GenerationLogRow
                                    key={`${asset.kind}:${id}`}
                                    asset={asset}
                                    selected={selectedIds.includes(id)}
                                    theme={theme}
                                    locale={i18n.resolvedLanguage}
                                    downloading={downloading}
                                    inserting={inserting}
                                    onSelectedChange={(checked) => toggleSelected(id, checked)}
                                    onPreview={() => setPreview(asset)}
                                    onInsert={() => handleInsert(asset)}
                                    onDownload={() => void handleDownload(asset)}
                                />
                            );
                        })}
                        {loadingMore ? (
                            <div className="flex justify-center py-3">
                                <Spin size="small" />
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("workbench.noLogs")} className="pt-16" />
                )}
            </div>
            <Drawer
                open={Boolean(preview)}
                title={preview?.title || preview?.model || t("workbench.logs")}
                onClose={() => setPreview(null)}
                placement="right"
                size="large"
                destroyOnHidden
            >
                {preview ? (
                    <GenerationLogPreview
                        asset={preview}
                        theme={theme}
                        downloading={downloading}
                        inserting={inserting}
                        onInsert={() => handleInsert(preview)}
                        onDownload={() => void handleDownload(preview)}
                        onDownloadFile={(file) => void handleDownload(preview, file)}
                    />
                ) : null}
            </Drawer>
        </div>
    );
});

function GenerationLogRow({
    asset,
    selected,
    theme,
    locale,
    downloading,
    inserting,
    onSelectedChange,
    onPreview,
    onInsert,
    onDownload,
}: {
    asset: GenerationAsset;
    selected: boolean;
    theme: CanvasTheme;
    locale?: string;
    downloading: boolean;
    inserting: boolean;
    onSelectedChange: (checked: boolean) => void;
    onPreview: () => void;
    onInsert: () => void;
    onDownload: () => void;
}) {
    const { t } = useTranslation();
    const files = mediaFiles(asset);
    const coverUrl = files[0]?.url;
    const cover = coverUrl && !isSignedUrlExpired(coverUrl) ? coverUrl : undefined;
    const canUseMedia = files.length > 0;
    const canInsert = files.some(canInsertFile);
    const KindIcon = asset.kind === "video" ? Video : ImageIcon;
    const statusColor = asset.status === "success" ? "blue" : asset.status === "pending" ? "processing" : "red";
    const statusLabel =
        asset.status === "success" ? t("workbench.success") : asset.status === "pending" ? t("workbench.generating") : t("workbench.failed");
    const actionStyle = { color: theme.node.muted };

    return (
        <div className="group relative flex items-start gap-2 rounded-lg px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
            <Checkbox className="mt-2.5" checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
            <button type="button" onClick={onPreview} className="min-w-0 flex-1 text-left">
                <div className="flex items-start gap-2.5">
                    {cover ? (
                        asset.kind === "video" ? (
                            <video src={`${cover}#t=0.1`} muted playsInline preload="metadata" className="size-12 shrink-0 rounded-md object-cover" />
                        ) : (
                            <SmartImage src={cover} alt="" className="size-12 shrink-0 rounded-md object-cover" fallbackIconClassName="size-4" />
                        )
                    ) : (
                        <span className="grid size-12 shrink-0 place-items-center rounded-md" style={{ background: theme.node.panel }}>
                            <KindIcon className="size-4 opacity-50" />
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium leading-snug">{asset.title || asset.prompt || t("workbench.untitled")}</div>
                        <div className="mt-0.5 line-clamp-2 text-xs leading-snug opacity-50">{asset.prompt || asset.model}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                            <Tag className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none">
                                {t(`canvas.sidePanel.filter.${asset.kind}`)}
                            </Tag>
                            <Tag className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none" color={statusColor}>
                                {statusLabel}
                            </Tag>
                            {asset.kind === "video" ? (() => {
                                const mirror = summarizeMirrorStatus(asset.assets);
                                if (!mirror.labelKey) return null;
                                return (
                                    <Tag
                                        className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none"
                                        color={mirror.color}
                                        title={mirror.error || undefined}
                                    >
                                        {t(mirror.labelKey)}
                                    </Tag>
                                );
                            })() : null}
                            <Tag className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none opacity-80">
                                {formatLogTime(asset.created_at, locale)}
                            </Tag>
                        </div>
                    </div>
                </div>
            </button>
            <div className="mt-1 flex shrink-0 flex-col gap-0.5">
                <button
                    type="button"
                    disabled={!canUseMedia || downloading}
                    onClick={onDownload}
                    className="grid size-7 place-items-center rounded-md opacity-70 transition hover:bg-black/10 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10"
                    style={actionStyle}
                    aria-label={t("common.download")}
                    title={canUseMedia ? t("common.download") : t("canvas.sidePanel.cannotDownloadLog")}
                >
                    <Download className="size-3.5" />
                </button>
                <button
                    type="button"
                    disabled={!canInsert || inserting}
                    onClick={onInsert}
                    className="grid size-7 place-items-center rounded-md opacity-70 transition hover:bg-black/10 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10"
                    style={actionStyle}
                    aria-label={t("canvas.sidePanel.inserted")}
                    title={canInsert ? t("canvas.sidePanel.inserted") : files.length ? t("canvas.sidePanel.cannotInsertExpired") : t("canvas.sidePanel.cannotInsertLog")}
                >
                    {inserting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                </button>
            </div>
        </div>
    );
}

function GenerationLogPreview({
    asset,
    theme,
    downloading,
    inserting,
    onInsert,
    onDownload,
    onDownloadFile,
}: {
    asset: GenerationAsset;
    theme: CanvasTheme;
    downloading: boolean;
    inserting: boolean;
    onInsert: () => void;
    onDownload: () => void;
    onDownloadFile: (file: GenerationAssetFile) => void;
}) {
    const { t } = useTranslation();
    const files = mediaFiles(asset);
    const canUseMedia = files.length > 0;
    const canInsert = files.some(canInsertFile);
    const primaryButtonStyle = {
        background: theme.node.activeStroke,
        color: theme.node.panel,
    };
    const secondaryButtonStyle = {
        background: theme.node.fill,
        color: theme.node.text,
        borderColor: theme.node.stroke,
    };

    return (
        <div className="space-y-3">
            <div className="text-sm opacity-70 whitespace-pre-wrap break-words">{asset.prompt || t("workbench.untitled")}</div>
            <div className="flex flex-wrap gap-1.5 text-xs opacity-60">
                <span>{asset.model || "-"}</span>
                <span>·</span>
                <span>{t(`canvas.sidePanel.filter.${asset.kind}`)}</span>
                <span>·</span>
                <span>{t(`canvas.sidePanel.logSource.${asset.source}`)}</span>
            </div>
            {asset.kind === "video" ? (() => {
                const mirror = summarizeMirrorStatus(asset.assets);
                if (!mirror.labelKey) return null;
                return (
                    <div className="space-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="opacity-60">{t("Mirror Stage")}</span>
                            <Tag className="m-0" color={mirror.color}>
                                {t(mirror.labelKey)}
                            </Tag>
                        </div>
                        {mirror.error ? <div className="text-red-500 break-words">{mirror.error}</div> : null}
                        {mirror.backupUrl ? (
                            <div className="opacity-50 break-all">
                                {t("Backup URL")}: {mirror.backupUrl}
                            </div>
                        ) : null}
                    </div>
                );
            })() : null}
            {files.length ? (
                <div className={cn("grid gap-2", asset.kind === "video" ? "grid-cols-1" : "grid-cols-2")}>
                    {files.map((file, index) => (
                        <div key={`${asset.id}-${index}`} className="group relative overflow-hidden rounded-lg">
                            {asset.kind === "video" ? (
                                isSignedUrlExpired(file.url) ? (
                                    <div className="flex h-40 w-full items-center justify-center bg-black text-xs text-stone-400">
                                        {t("canvas.sidePanel.mediaLinkExpired")}
                                    </div>
                                ) : (
                                    <video src={file.url} controls className="max-h-80 w-full bg-black object-contain" />
                                )
                            ) : (
                                <SmartImage src={isSignedUrlExpired(file.url) ? undefined : file.url} alt="" className="w-full object-cover" />
                            )}
                            <button
                                type="button"
                                disabled={downloading}
                                onClick={() => onDownloadFile(file)}
                                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium shadow-sm opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                                style={primaryButtonStyle}
                                aria-label={t("common.download")}
                                title={t("common.download")}
                            >
                                <Download className="size-3.5" />
                                {t("common.download")}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={asset.error || t("canvas.sidePanel.cannotInsertLog")} />
            )}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    disabled={!canUseMedia || downloading}
                    onClick={onDownload}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={secondaryButtonStyle}
                >
                    <Download className="size-3.5" />
                    {t("common.download")}
                </button>
                <button
                    type="button"
                    disabled={!canInsert || inserting}
                    onClick={onInsert}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={primaryButtonStyle}
                    title={canInsert ? t("canvas.sidePanel.inserted") : files.length ? t("canvas.sidePanel.cannotInsertExpired") : t("canvas.sidePanel.cannotInsertLog")}
                >
                    {inserting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    {t("canvas.sidePanel.inserted")}
                </button>
            </div>
        </div>
    );
}
