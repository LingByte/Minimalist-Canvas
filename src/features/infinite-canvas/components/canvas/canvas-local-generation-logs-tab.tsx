import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { App, Empty, Input, Spin, Tag } from "antd";
import { Download, Image as ImageIcon, Plus, Search, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CanvasTheme } from "@canvas/lib/canvas-theme";
import { cn } from "@canvas/lib/utils";
import { resolveMediaUrl } from "@canvas/services/file-storage";
import { resolveImageUrl } from "@canvas/services/image-storage";
import {
    listLocalGenerationLogs,
    type LocalGenerationLogEntry,
} from "@canvas/services/local-generation-logs";

import type { InsertAssetPayload } from "./asset-picker-modal";

type KindFilter = "all" | "image" | "video";

type Props = {
    onInsert: (payload: InsertAssetPayload) => void | Promise<void>;
    theme: CanvasTheme;
};

function formatLogTime(value: number, locale?: string) {
    return new Date(value).toLocaleString(locale, { hour12: false });
}

async function resolveEntryMedia(entry: LocalGenerationLogEntry): Promise<LocalGenerationLogEntry> {
    if (entry.kind === "image") {
        const images = await Promise.all(
            (entry.images || []).map(async (image) => ({
                ...image,
                dataUrl: await resolveImageUrl(image.storageKey, image.dataUrl),
            })),
        );
        return { ...entry, images, thumbnails: images.map((item) => item.dataUrl).filter(Boolean) };
    }
    const video = entry.video
        ? {
              ...entry.video,
              url: await resolveMediaUrl(entry.video.storageKey, entry.video.url),
          }
        : undefined;
    return { ...entry, video };
}

function entryCover(entry: LocalGenerationLogEntry) {
    if (entry.kind === "image") return entry.images?.[0]?.dataUrl || entry.thumbnails?.[0] || "";
    return entry.video?.url || "";
}

function entryCanInsert(entry: LocalGenerationLogEntry) {
    return Boolean(entryCover(entry));
}

export const CanvasLocalGenerationLogsTab = memo(function CanvasLocalGenerationLogsTab({ onInsert, theme }: Props) {
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();
    const [items, setItems] = useState<LocalGenerationLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [insertingId, setInsertingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const raw = await listLocalGenerationLogs("all");
            const resolved = await Promise.all(raw.map(resolveEntryMedia));
            setItems(resolved);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return items
            .filter((item) => kindFilter === "all" || item.kind === kindFilter)
            .filter((item) => {
                if (!query) return true;
                return [item.title, item.prompt, item.model, item.origin].filter(Boolean).join(" ").toLowerCase().includes(query);
            });
    }, [items, keyword, kindFilter]);

    const handleInsert = async (entry: LocalGenerationLogEntry) => {
        if (!entryCanInsert(entry)) {
            message.warning(t("canvas.sidePanel.cannotInsertLog"));
            return;
        }
        if (insertingId) return;
        setInsertingId(entry.id);
        try {
            if (entry.kind === "video") {
                const video = entry.video!;
                await onInsert({
                    kind: "video",
                    url: video.url,
                    storageKey: video.storageKey,
                    title: entry.title || entry.prompt || t("workbench.untitled"),
                    width: video.width,
                    height: video.height,
                });
            } else {
                for (const [index, image] of (entry.images || []).entries()) {
                    if (!image.dataUrl?.trim()) continue;
                    await onInsert({
                        kind: "image",
                        dataUrl: image.dataUrl,
                        storageKey: image.storageKey,
                        title:
                            (entry.images?.length || 0) > 1
                                ? `${entry.title || entry.prompt || t("workbench.untitled")} ${index + 1}`
                                : entry.title || entry.prompt || t("workbench.untitled"),
                    });
                }
            }
            message.success(t("canvas.sidePanel.inserted"));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.insertFailed"));
        } finally {
            setInsertingId(null);
        }
    };

    const handleDownload = (entry: LocalGenerationLogEntry) => {
        const url = entryCover(entry);
        if (!url) {
            message.warning(t("canvas.sidePanel.cannotDownloadLog"));
            return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        message.info(t("canvas.sidePanel.logDownloadHint"));
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
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {loading ? (
                    <div className="grid place-items-center py-16">
                        <Spin />
                    </div>
                ) : filtered.length ? (
                    <div className="space-y-1">
                        {filtered.map((entry) => {
                            const cover = entryCover(entry);
                            const canUse = entryCanInsert(entry);
                            const KindIcon = entry.kind === "video" ? Video : ImageIcon;
                            const statusColor =
                                entry.status === "success" ? "blue" : entry.status === "pending" ? "processing" : "red";
                            const statusLabel =
                                entry.status === "success"
                                    ? t("workbench.success")
                                    : entry.status === "pending"
                                      ? t("workbench.generating")
                                      : t("workbench.failed");
                            return (
                                <div
                                    key={`${entry.kind}:${entry.id}`}
                                    className="group relative flex items-start gap-2 rounded-lg px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-2.5">
                                            {cover ? (
                                                entry.kind === "video" ? (
                                                    <video
                                                        src={`${cover}#t=0.1`}
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                        className="size-12 shrink-0 rounded-md object-cover"
                                                    />
                                                ) : (
                                                    <img src={cover} alt="" className="size-12 shrink-0 rounded-md object-cover" loading="lazy" />
                                                )
                                            ) : (
                                                <span
                                                    className="grid size-12 shrink-0 place-items-center rounded-md"
                                                    style={{ background: theme.node.panel }}
                                                >
                                                    <KindIcon className="size-4 opacity-50" />
                                                </span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium leading-snug">
                                                    {entry.title || entry.prompt || t("workbench.untitled")}
                                                </div>
                                                <div className="mt-0.5 line-clamp-2 text-xs leading-snug opacity-50">
                                                    {entry.prompt || entry.model}
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                    <Tag className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none">
                                                        {t(`canvas.sidePanel.filter.${entry.kind}`)}
                                                    </Tag>
                                                    <Tag
                                                        className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none"
                                                        color={statusColor}
                                                    >
                                                        {statusLabel}
                                                    </Tag>
                                                    <Tag className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none opacity-80">
                                                        {formatLogTime(entry.createdAt, i18n.resolvedLanguage)}
                                                    </Tag>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-1 flex shrink-0 flex-col gap-0.5" style={{ color: theme.node.muted }}>
                                        <button
                                            type="button"
                                            onClick={() => handleDownload(entry)}
                                            className="grid size-7 place-items-center rounded-md opacity-70 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                                            aria-label={t("common.download")}
                                            title={canUse ? t("common.download") : t("canvas.sidePanel.cannotDownloadLog")}
                                        >
                                            <Download className="size-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={insertingId === entry.id}
                                            onClick={() => void handleInsert(entry)}
                                            className="grid size-7 place-items-center rounded-md opacity-70 transition hover:bg-black/10 hover:opacity-100 disabled:opacity-40 dark:hover:bg-white/10"
                                            aria-label={t("canvas.sidePanel.inserted")}
                                            title={canUse ? t("canvas.sidePanel.inserted") : t("canvas.sidePanel.cannotInsertLog")}
                                        >
                                            <Plus className="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.noLogs")} className="pt-16" />
                )}
            </div>
        </div>
    );
});
