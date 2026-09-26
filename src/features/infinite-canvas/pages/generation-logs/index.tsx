import { memo, useEffect, useMemo, useState } from "react";
import { App, Button, Drawer, Empty, Input, Popconfirm, Segmented, Spin, Tag } from "antd";
import { Download, Image as ImageIcon, RefreshCw, Search, Trash2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { toIntlLocale } from "@/i18n/languages";
import { SectionPageLayout } from "@/components/layout";

import { saveBlobAs } from "@canvas/lib/save-file";
import {
    deleteGenerationAssetsByClientIds,
    type GenerationAsset,
    type GenerationAssetFile,
    type GenerationAssetKind,
    type GenerationAssetStatus,
} from "@canvas/services/api/generation-assets";
import { useGenerationLogsBadgeStore } from "@canvas/stores/use-generation-logs-badge-store";

type KindFilter = "all" | GenerationAssetKind;
type StatusFilter = "all" | GenerationAssetStatus;

function createdAtMs(value: number) {
    return value > 1e12 ? value : value * 1000;
}

function formatLogTime(value: number, locale?: string) {
    return new Date(createdAtMs(value)).toLocaleString(toIntlLocale(locale), { hour12: false });
}

function mediaFiles(asset: GenerationAsset) {
    const files = (asset.assets || []).filter((item) => Boolean(item.url?.trim()));
    if (files.length <= 1) return files;
    if (asset.kind === "video") return [preferMediaFile(files)];
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

export default function GenerationLogsPage() {
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();
    const items = useGenerationLogsBadgeStore((state) => state.items);
    const loading = useGenerationLogsBadgeStore((state) => state.loading);
    const loadingMore = useGenerationLogsBadgeStore((state) => state.loadingMore);
    const hasMore = useGenerationLogsBadgeStore((state) => state.hasMore);
    const refresh = useGenerationLogsBadgeStore((state) => state.refresh);
    const loadMore = useGenerationLogsBadgeStore((state) => state.loadMore);
    const markSeen = useGenerationLogsBadgeStore((state) => state.markSeen);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [preview, setPreview] = useState<GenerationAsset | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        markSeen();
        void refresh();
    }, [markSeen, refresh]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return items
            .filter((item) => kindFilter === "all" || item.kind === kindFilter)
            .filter((item) => statusFilter === "all" || item.status === statusFilter)
            .filter((item) => {
                if (!query) return true;
                return [item.title, item.prompt, item.model, item.source].filter(Boolean).join(" ").toLowerCase().includes(query);
            })
            .sort((a, b) => createdAtMs(b.created_at) - createdAtMs(a.created_at));
    }, [items, keyword, kindFilter, statusFilter]);

    const handleDownload = async (asset: GenerationAsset) => {
        const files = mediaFiles(asset);
        if (!files.length) return;
        const base = safeDownloadName(asset.title || asset.prompt || t("Untitled"));
        setDownloading(true);
        try {
            for (const [index, file] of files.entries()) {
                const ext = mediaExtension(file, asset.kind);
                await saveBlobAs(String(file.url), files.length > 1 ? `${base}-${index + 1}.${ext}` : `${base}.${ext}`);
            }
        } catch {
            message.error(t("Download failed"));
        } finally {
            setDownloading(false);
        }
    };

    const handleDelete = async (asset: GenerationAsset) => {
        const id = logClientId(asset);
        setDeletingId(id);
        try {
            await deleteGenerationAssetsByClientIds([id]);
            if (preview && logClientId(preview) === id) setPreview(null);
            await refresh();
        } finally {
            setDeletingId(null);
        }
    };

    const statusTag = (asset: GenerationAsset) => {
        const status = asset.status;
        const color = status === "success" ? "blue" : status === "pending" ? "processing" : "red";
        const label = status === "success" ? t("Success") : status === "pending" ? t("Pending") : t("Failed");
        return (
            <Tag className="m-0" color={color}>
                {label}
            </Tag>
        );
    };

    return (
        <>
            <SectionPageLayout>
                <SectionPageLayout.Title>{t("Generation Records")}</SectionPageLayout.Title>
                <SectionPageLayout.Actions>
                    <Button icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void refresh()}>
                        {t("Refresh")}
                    </Button>
                </SectionPageLayout.Actions>
                <SectionPageLayout.Content>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <Input
                                allowClear
                                prefix={<Search className="size-3.5 text-muted-foreground" />}
                                placeholder={t("Search")}
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                className="max-w-xs"
                            />
                            <Segmented
                                value={kindFilter}
                                onChange={(value) => setKindFilter(value as KindFilter)}
                                options={[
                                    { label: t("All"), value: "all" },
                                    { label: t("Image"), value: "image" },
                                    { label: t("Video"), value: "video" },
                                ]}
                            />
                            <Segmented
                                value={statusFilter}
                                onChange={(value) => setStatusFilter(value as StatusFilter)}
                                options={[
                                    { label: t("All"), value: "all" },
                                    { label: t("Success"), value: "success" },
                                    { label: t("Pending"), value: "pending" },
                                    { label: t("Failed"), value: "failed" },
                                ]}
                            />
                        </div>

                        {loading && !items.length ? (
                            <div className="flex justify-center py-24">
                                <Spin />
                            </div>
                        ) : filtered.length ? (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {filtered.map((asset) => (
                                        <GenerationLogCard
                                            key={`${asset.kind}:${logClientId(asset)}`}
                                            asset={asset}
                                            locale={i18n.resolvedLanguage}
                                            downloading={downloading}
                                            deleting={deletingId === logClientId(asset)}
                                            onPreview={() => setPreview(asset)}
                                            onDownload={() => void handleDownload(asset)}
                                            onDelete={() => void handleDelete(asset)}
                                            statusTag={statusTag(asset)}
                                            t={t}
                                        />
                                    ))}
                                </div>
                                {hasMore ? (
                                    <div className="flex justify-center">
                                        <Button loading={loadingMore} onClick={() => void loadMore()}>
                                            {t("Load more")}
                                        </Button>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("No data")} className="py-24" />
                        )}
                    </div>
                </SectionPageLayout.Content>
            </SectionPageLayout>

            <Drawer
                open={Boolean(preview)}
                title={preview?.title || preview?.model || t("Generation Records")}
                onClose={() => setPreview(null)}
                width={560}
                destroyOnHidden
            >
                {preview ? <GenerationLogPreview asset={preview} locale={i18n.resolvedLanguage} downloading={downloading} onDownload={() => void handleDownload(preview)} statusTag={statusTag(preview)} t={t} /> : null}
            </Drawer>
        </>
    );
}

const GenerationLogCard = memo(function GenerationLogCard({
    asset,
    locale,
    downloading,
    deleting,
    onPreview,
    onDownload,
    onDelete,
    statusTag,
    t,
}: {
    asset: GenerationAsset;
    locale?: string;
    downloading: boolean;
    deleting: boolean;
    onPreview: () => void;
    onDownload: () => void;
    onDelete: () => void;
    statusTag: React.ReactNode;
    t: (key: string) => string;
}) {
    const files = mediaFiles(asset);
    const cover = files[0]?.url;
    const KindIcon = asset.kind === "video" ? Video : ImageIcon;

    return (
        <article className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md">
            <button type="button" onClick={onPreview} className="relative aspect-video w-full overflow-hidden bg-muted text-left">
                {cover ? (
                    asset.kind === "video" ? (
                        <video src={`${cover}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
                    ) : (
                        <img src={cover} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    )
                ) : (
                    <span className="grid size-full place-items-center text-muted-foreground">
                        <KindIcon className="size-8 opacity-40" />
                    </span>
                )}
                <span className="absolute left-2 top-2">{statusTag}</span>
            </button>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="truncate text-sm font-medium" title={asset.title || asset.prompt}>
                    {asset.title || asset.prompt || t("Untitled")}
                </div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{asset.prompt || asset.model || "-"}</div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Tag className="m-0 flex h-5 items-center rounded px-1.5 text-[10px] leading-none">
                            {asset.kind === "video" ? t("Video") : t("Image")}
                        </Tag>
                        {asset.model ? <span className="truncate">{asset.model}</span> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <Button type="text" size="small" shape="circle" loading={downloading} icon={<Download className="size-3.5" />} onClick={onDownload} aria-label={t("Download")} disabled={!files.length} />
                        <Popconfirm title={t("Delete generation assets?")} okText={t("Delete")} cancelText={t("Cancel")} okButtonProps={{ danger: true }} onConfirm={onDelete}>
                            <Button type="text" size="small" shape="circle" danger loading={deleting} icon={<Trash2 className="size-3.5" />} aria-label={t("Delete")} />
                        </Popconfirm>
                    </div>
                </div>
                <p className="text-[11px] text-muted-foreground/70">{formatLogTime(asset.created_at, locale)}</p>
            </div>
        </article>
    );
});

function GenerationLogPreview({
    asset,
    locale,
    downloading,
    onDownload,
    statusTag,
    t,
}: {
    asset: GenerationAsset;
    locale?: string;
    downloading: boolean;
    onDownload: () => void;
    statusTag: React.ReactNode;
    t: (key: string) => string;
}) {
    const files = mediaFiles(asset);
    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-3">
                {files.map((file, index) =>
                    asset.kind === "video" ? (
                        <video key={index} src={String(file.url)} controls playsInline className="max-h-[420px] w-full rounded-lg bg-black" />
                    ) : (
                        <img key={index} src={String(file.url)} alt="" className="max-h-[420px] w-full rounded-lg object-contain" />
                    ),
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {statusTag}
                <Tag className="m-0">{asset.kind === "video" ? t("Video") : t("Image")}</Tag>
                {asset.source ? <Tag className="m-0">{asset.source}</Tag> : null}
                {asset.model ? <span>{asset.model}</span> : null}
                <span className="ml-auto">{formatLogTime(asset.created_at, locale)}</span>
            </div>
            {asset.prompt ? <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{asset.prompt}</p> : null}
            {asset.error ? <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{asset.error}</p> : null}
            <div className="flex justify-end">
                <Button type="primary" loading={downloading} icon={<Download className="size-3.5" />} onClick={onDownload} disabled={!files.length}>
                    {t("Download")}
                </Button>
            </div>
        </div>
    );
}
