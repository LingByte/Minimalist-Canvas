import {
    ChevronRight,
    Copy,
    Eye,
    Folder,
    HardDrive,
    Link2,
    RefreshCw,
    Settings2,
    Trash2,
    Upload as UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Checkbox, DatePicker, Empty, Input, Modal, Pagination, Select, Spin, Tabs, Tooltip, Upload } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@canvas/hooks/use-copy-text";
import { formatBytes } from "@canvas/lib/image-utils";
import {
    defaultCdnRangeUnits,
    fetchCdnTrafficSummary,
    normalizeCdnInterval,
    type CdnTrafficInterval,
    type CdnTrafficSummary,
} from "@canvas/lib/object-storage/cdn-traffic";

type CdnRangePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

function ymdLocal(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function rangeForPreset(preset: CdnRangePreset): { days?: number; startDate?: string; endDate?: string } {
    const today = new Date();
    const todayStr = ymdLocal(today);
    if (preset === "today") return { startDate: todayStr, endDate: todayStr, days: 1 };
    if (preset === "yesterday") {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        const s = ymdLocal(y);
        return { startDate: s, endDate: s, days: 1 };
    }
    if (preset === "30d") return { days: 30 };
    if (preset === "custom") return { days: 7 };
    return { days: 7 };
}

/** Map UI preset + interval into API lookback without treating "7 days" as "7 months". */
function resolveStorageCdnQuery(
    preset: CdnRangePreset,
    interval: CdnTrafficInterval,
    cdnDays: number,
    customRange: [Dayjs, Dayjs] | null,
): { days?: number; startDate?: string; endDate?: string } {
    if (preset === "custom" && customRange) {
        return {
            startDate: customRange[0].format("YYYY-MM-DD"),
            endDate: customRange[1].format("YYYY-MM-DD"),
        };
    }
    if (interval === "month") {
        // Month granularity uses month units (3/6/12), not day presets.
        if (preset === "30d") return { days: 1 };
        if (preset === "7d" || preset === "today" || preset === "yesterday") return { days: defaultCdnRangeUnits("month") };
        return { days: cdnDays || defaultCdnRangeUnits("month") };
    }
    return rangeForPreset(preset);
}
import {
    deleteObjectsAtKeys,
    listObjects,
    putObjectAtKey,
    summarizeObjectStorageUsage,
    type ObjectStorageListedObject,
    type ObjectStorageUsageSummary,
} from "@canvas/lib/object-storage/client";
import { buildObjectAccessUrl, buildObjectKey, normalizePathPrefix } from "@canvas/lib/object-storage/providers";
import { isObjectStorageConfigured } from "@canvas/lib/object-storage/types";
import { useConfigStore } from "@canvas/stores/use-config-store";
import { cn } from "@canvas/lib/utils";

import { CdnTrafficChart, formatBandwidth, formatCdnTraffic } from "./cdn-traffic-chart";

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const CDN_INTERVAL_OPTIONS: CdnTrafficInterval[] = ["5min", "hour", "day", "month"];

function cdnRangeOptions(interval: CdnTrafficInterval): number[] {
    if (interval === "5min") return [1, 3];
    if (interval === "hour") return [1, 7, 30];
    if (interval === "month") return [3, 6, 12];
    return [7, 30, 90];
}

function displayBytes(bytes: number) {
    return formatBytes(bytes) || "0 B";
}

function fileNameFromKey(key: string, prefix: string) {
    const rest = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    return rest || key;
}

function folderLabel(prefix: string, parent: string) {
    const rest = prefix.startsWith(parent) ? prefix.slice(parent.length) : prefix;
    return rest.replace(/\/+$/, "") || prefix;
}

function breadcrumbSegments(prefix: string) {
    const cleaned = normalizePathPrefix(prefix);
    if (!cleaned) return [] as { label: string; prefix: string }[];
    const parts = cleaned.replace(/\/+$/, "").split("/").filter(Boolean);
    return parts.map((label, index) => ({
        label,
        prefix: `${parts.slice(0, index + 1).join("/")}/`,
    }));
}

function guessPreviewKind(key: string): "image" | "video" | "audio" | "text" | "other" {
    const name = key.split("?")[0].toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/.test(name)) return "image";
    if (/\.(mp4|webm|mov|m4v|mkv)$/.test(name)) return "video";
    if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(name)) return "audio";
    if (/\.(txt|md|json|csv|xml|html?|css|js|ts|tsx|jsx|yml|yaml|log|svg)$/.test(name)) return "text";
    return "other";
}

type Row =
    | { kind: "folder"; key: string }
    | { kind: "object"; item: ObjectStorageListedObject };

export default function StoragePage() {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const copyText = useCopyText();
    const objectStorage = useConfigStore((state) => state.objectStorage);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const configured = isObjectStorageConfigured(objectStorage);
    const rootPrefix = useMemo(() => normalizePathPrefix(objectStorage.pathPrefix), [objectStorage.pathPrefix]);

    const [prefix, setPrefix] = useState(rootPrefix);
    const [prefixDraft, setPrefixDraft] = useState(rootPrefix);
    const [folders, setFolders] = useState<string[]>([]);
    const [objects, setObjects] = useState<ObjectStorageListedObject[]>([]);
    const [continuationToken, setContinuationToken] = useState<string | undefined>();
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [usage, setUsage] = useState<ObjectStorageUsageSummary | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [cdn, setCdn] = useState<CdnTrafficSummary | null>(null);
    const [cdnLoading, setCdnLoading] = useState(false);
    const [cdnInterval, setCdnInterval] = useState<CdnTrafficInterval>("hour");
    const [cdnDays, setCdnDays] = useState(defaultCdnRangeUnits("hour"));
    const [cdnRangePreset, setCdnRangePreset] = useState<CdnRangePreset>("7d");
    const [cdnCustomRange, setCdnCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
    const [activeTab, setActiveTab] = useState<"files" | "cdn">("files");
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageJumpDraft, setPageJumpDraft] = useState("1");
    const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
    const [previewKey, setPreviewKey] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const listAbortRef = useRef<AbortController | null>(null);
    const usageAbortRef = useRef<AbortController | null>(null);
    const cdnAbortRef = useRef<AbortController | null>(null);
    const rowsCountRef = useRef(0);
    const hasMoreRef = useRef(false);
    const continuationRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        setPrefix(rootPrefix);
        setPrefixDraft(rootPrefix);
    }, [rootPrefix, objectStorage.bucket, objectStorage.provider]);

    useEffect(() => {
        setPrefixDraft(prefix);
    }, [prefix]);

    const goToPrefix = useCallback((value: string) => {
        setPrefix(normalizePathPrefix(value.trim()));
    }, []);

    const providerLabel = t(`config.objectStorage.providers.${objectStorage.provider}`);
    const crumbs = useMemo(() => breadcrumbSegments(prefix), [prefix]);

    const rows = useMemo<Row[]>(() => {
        const folderRows: Row[] = folders.map((key) => ({ kind: "folder", key }));
        const objectRows: Row[] = objects.map((item) => ({ kind: "object", item }));
        return [...folderRows, ...objectRows];
    }, [folders, objects]);

    const pageRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return rows.slice(start, start + pageSize);
    }, [page, pageSize, rows]);

    const loadUsage = useCallback(async () => {
        if (!configured) {
            setUsage(null);
            return;
        }
        usageAbortRef.current?.abort();
        const controller = new AbortController();
        usageAbortRef.current = controller;
        setUsageLoading(true);
        try {
            const summary = await summarizeObjectStorageUsage(objectStorage, {
                prefix: rootPrefix,
                maxPages: 30,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) setUsage(summary);
        } catch (err) {
            if (controller.signal.aborted) return;
            setUsage(null);
            message.warning(err instanceof Error ? err.message : t("storageManager.usageFailed"));
        } finally {
            if (!controller.signal.aborted) setUsageLoading(false);
        }
    }, [configured, message, objectStorage, rootPrefix, t]);

    const loadCdn = useCallback(async () => {
        if (!configured) {
            setCdn(null);
            return;
        }
        cdnAbortRef.current?.abort();
        const controller = new AbortController();
        cdnAbortRef.current = controller;
        setCdnLoading(true);
        try {
            const query = resolveStorageCdnQuery(cdnRangePreset, cdnInterval, cdnDays, cdnCustomRange);
            const summary = await fetchCdnTrafficSummary(objectStorage, {
                ...query,
                interval: cdnInterval,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) setCdn(summary);
        } catch (err) {
            if (controller.signal.aborted) return;
            setCdn({
                supported: false,
                provider: objectStorage.provider,
                error: err instanceof Error ? err.message : String(err),
            });
        } finally {
            if (!controller.signal.aborted) setCdnLoading(false);
        }
    }, [cdnCustomRange, cdnDays, cdnInterval, cdnRangePreset, configured, objectStorage]);

    const loadListing = useCallback(
        async (options?: { append?: boolean; token?: string }) => {
            if (!configured) {
                setFolders([]);
                setObjects([]);
                setHasMore(false);
                setContinuationToken(undefined);
                hasMoreRef.current = false;
                continuationRef.current = undefined;
                rowsCountRef.current = 0;
                setError(null);
                return;
            }
            listAbortRef.current?.abort();
            const controller = new AbortController();
            listAbortRef.current = controller;
            const append = Boolean(options?.append);
            if (append) setLoadingMore(true);
            else setLoading(true);
            setError(null);
            try {
                const result = await listObjects(objectStorage, {
                    prefix,
                    delimiter: "/",
                    maxKeys: Math.max(pageSize, 100),
                    continuationToken: options?.token,
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                const nextFolders = result.prefixes;
                const nextObjects = result.objects.filter((item) => item.key !== prefix && !item.key.endsWith("/"));
                let nextFolderList: string[] = [];
                let nextObjectList: ObjectStorageListedObject[] = [];
                setFolders((prev) => {
                    nextFolderList = append ? [...prev, ...nextFolders.filter((p) => !prev.includes(p))] : nextFolders;
                    return nextFolderList;
                });
                setObjects((prev) => {
                    if (!append) {
                        nextObjectList = nextObjects;
                        return nextObjects;
                    }
                    const seen = new Set(prev.map((item) => item.key));
                    nextObjectList = [...prev, ...nextObjects.filter((item) => !seen.has(item.key))];
                    return nextObjectList;
                });
                const more = Boolean(result.isTruncated && result.nextContinuationToken);
                setHasMore(more);
                setContinuationToken(result.nextContinuationToken);
                hasMoreRef.current = more;
                continuationRef.current = result.nextContinuationToken;
                rowsCountRef.current = nextFolderList.length + nextObjectList.length;
                if (!append) {
                    setSelected(new Set());
                    setPage(1);
                }
            } catch (err) {
                if (controller.signal.aborted) return;
                const text = err instanceof Error ? err.message : t("storageManager.loadFailed");
                setError(text);
                if (!append) {
                    setFolders([]);
                    setObjects([]);
                }
                message.error(text);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [configured, message, objectStorage, pageSize, prefix, t],
    );

    useEffect(() => {
        void loadListing();
        return () => listAbortRef.current?.abort();
    }, [loadListing]);

    useEffect(() => {
        void loadUsage();
        return () => usageAbortRef.current?.abort();
    }, [loadUsage]);

    useEffect(() => {
        void loadCdn();
        return () => cdnAbortRef.current?.abort();
    }, [loadCdn]);

    useEffect(() => {
        rowsCountRef.current = rows.length;
    }, [rows.length]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
        setPage((value) => {
            const next = Math.min(value, maxPage);
            setPageJumpDraft(String(next));
            return next;
        });
    }, [rows.length, pageSize]);

    const ensurePageLoaded = useCallback(
        async (nextPage: number) => {
            const target = Math.max(1, Math.floor(nextPage) || 1);
            let guard = 0;
            while (target * pageSize > rowsCountRef.current && hasMoreRef.current && continuationRef.current && guard < 30) {
                guard += 1;
                await loadListing({ append: true, token: continuationRef.current });
            }
            const maxPage = Math.max(1, Math.ceil(rowsCountRef.current / pageSize) || 1);
            const clamped = Math.min(target, maxPage);
            setPage(clamped);
            setPageJumpDraft(String(clamped));
        },
        [loadListing, pageSize],
    );

    const jumpToPage = useCallback(() => {
        const parsed = Number(pageJumpDraft);
        if (!Number.isFinite(parsed) || parsed < 1) {
            setPageJumpDraft(String(page));
            return;
        }
        void ensurePageLoaded(parsed);
    }, [ensurePageLoaded, page, pageJumpDraft]);

    const visibleObjectKeys = useMemo(
        () => pageRows.filter((row): row is Extract<Row, { kind: "object" }> => row.kind === "object").map((row) => row.item.key),
        [pageRows],
    );
    const allSelected = visibleObjectKeys.length > 0 && visibleObjectKeys.every((key) => selected.has(key));
    const someSelected = selected.size > 0;

    const toggleAll = () => {
        if (allSelected) {
            setSelected((prev) => {
                const next = new Set(prev);
                for (const key of visibleObjectKeys) next.delete(key);
                return next;
            });
            return;
        }
        setSelected((prev) => {
            const next = new Set(prev);
            for (const key of visibleObjectKeys) next.add(key);
            return next;
        });
    };

    const toggleKey = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const uploadFiles = async (files: File[]) => {
        if (!configured) {
            message.warning(t("storageManager.configureFirst"));
            openConfigDialog(false, "object-storage");
            return;
        }
        if (!files.length) return;
        setUploading(true);
        let ok = 0;
        try {
            for (const file of files) {
                const key = buildObjectKey(prefix, file.name);
                await putObjectAtKey(objectStorage, key, file, { contentType: file.type || undefined });
                ok += 1;
            }
            message.success(t("storageManager.uploaded", { count: ok }));
            await loadListing();
            void loadUsage();
        } catch (err) {
            message.error(err instanceof Error ? err.message : t("storageManager.uploadFailed"));
            if (ok > 0) {
                await loadListing();
                void loadUsage();
            }
        } finally {
            setUploading(false);
        }
    };

    const confirmDelete = (keys: string[]) => {
        if (!keys.length) return;
        modal.confirm({
            title: t("storageManager.deleteTitle", { count: keys.length }),
            content: t("storageManager.deleteDescription"),
            okText: t("storageManager.delete"),
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteObjectsAtKeys(objectStorage, keys);
                    message.success(t("storageManager.deleted", { count: keys.length }));
                    setSelected((prev) => {
                        const next = new Set(prev);
                        for (const key of keys) next.delete(key);
                        return next;
                    });
                    await loadListing();
                    void loadUsage();
                } catch (err) {
                    message.error(err instanceof Error ? err.message : t("storageManager.deleteFailed"));
                }
            },
        });
    };

    const openUrl = (key: string) => {
        const url = buildObjectAccessUrl(objectStorage, key);
        copyText(url, t("storageManager.urlCopied"));
    };

    const previewUrl = previewKey ? buildObjectAccessUrl(objectStorage, previewKey) : "";
    const previewKind = previewKey ? guessPreviewKind(previewKey) : "other";

    const cdnValue = (() => {
        if (cdnLoading && !cdn) return "…";
        if (!cdn) return t("storageManager.cdnUnavailableValue");
        if (cdn.error === "missing-domain") return t("storageManager.cdnNeedDomain");
        if (cdn.error === "unsupported-provider") return t("storageManager.cdnUnsupported");
        if (cdn.error) return t("storageManager.cdnFailed");
        if (typeof cdn.bytesToday === "number") return displayBytes(cdn.bytesToday);
        return t("storageManager.cdnUnavailableValue");
    })();

    const cdnHint = (() => {
        if (!cdn) return cdnLoading ? t("storageManager.cdnLoading") : undefined;
        if (cdn.error === "missing-domain") return t("storageManager.cdnNeedDomainHint");
        if (cdn.error === "unsupported-provider") return t("storageManager.cdnUnsupportedHint");
        if (cdn.error) return cdn.error;
        if (typeof cdn.bytesLast7Days === "number") {
            return t("storageManager.cdnLast7Days", { size: displayBytes(cdn.bytesLast7Days) });
        }
        return cdn.domain;
    })();

    if (!configured) {
        return (
            <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
                <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                    <div className="mx-auto w-full max-w-[1400px]">
                        <h1 className="text-2xl font-semibold tracking-tight">{t("storageManager.title")}</h1>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("storageManager.subtitle")}</p>
                        <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-stone-300/80 px-6 py-16 dark:border-stone-700">
                            <HardDrive className="size-10 text-stone-400" />
                            <div className="max-w-md text-center text-sm text-stone-500 dark:text-stone-400">
                                {t("storageManager.configureFirst")}
                            </div>
                            <Button type="primary" icon={<Settings2 className="size-3.5" />} onClick={() => openConfigDialog(false, "object-storage")}>
                                {t("storageManager.openConfig")}
                            </Button>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1400px]">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">{t("storageManager.title")}</h1>
                            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("storageManager.subtitle")}</p>
                        </div>
                        <Button icon={<Settings2 className="size-3.5" />} onClick={() => openConfigDialog(false, "object-storage")}>
                            {t("storageManager.openConfig")}
                        </Button>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard label={t("storageManager.provider")} value={providerLabel} hint={objectStorage.publicBaseUrl.trim() || undefined} />
                        <StatCard label={t("storageManager.bucket")} value={objectStorage.bucket || "—"} hint={objectStorage.region || undefined} />
                        <StatCard
                            label={t("storageManager.storageUsed")}
                            value={usageLoading && !usage ? "…" : displayBytes(usage?.totalBytes || 0)}
                            hint={
                                usage
                                    ? t("storageManager.objectCount", { count: usage.objectCount }) +
                                      (usage.truncated ? ` · ${t("storageManager.usageTruncated")}` : "")
                                    : usageLoading
                                      ? t("storageManager.usageLoading")
                                      : t("storageManager.usageEmpty")
                            }
                        />
                        <StatCard label={t("storageManager.cdnTrafficToday")} value={cdnValue} hint={cdnHint} />
                    </div>

                    <Tabs
                        className="mt-4"
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as "files" | "cdn")}
                        items={[
                            {
                                key: "files",
                                label: t("storageManager.tabFiles"),
                                children: (
                                    <>
                    <div className="mt-1">
                        <Upload.Dragger
                            multiple
                            showUploadList={false}
                            disabled={uploading}
                            beforeUpload={(file, fileList) => {
                                const batch = fileList as File[];
                                if (file === batch[batch.length - 1]) void uploadFiles(batch);
                                return false;
                            }}
                            className="!rounded-xl [&_.ant-upload-drag]:!border-stone-300/80 [&_.ant-upload-drag]:!bg-transparent [&_.ant-upload-drag]:!px-3 [&_.ant-upload-drag]:!py-2 dark:[&_.ant-upload-drag]:!border-stone-700"
                        >
                            <div className="flex items-center justify-between gap-3 px-1 py-0.5">
                                <div className="flex min-w-0 items-center gap-2 text-left">
                                    <UploadIcon className="size-4 shrink-0 text-stone-500" />
                                    <div className="min-w-0">
                                        <div className="truncate text-sm text-stone-700 dark:text-stone-200">
                                            {uploading ? t("storageManager.uploading") : t("storageManager.dropFilesCompact")}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="small"
                                    type="primary"
                                    loading={uploading}
                                    icon={<UploadIcon className="size-3.5" />}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        fileRef.current?.click();
                                    }}
                                >
                                    {t("storageManager.upload")}
                                </Button>
                            </div>
                        </Upload.Dragger>
                        <input
                            ref={fileRef}
                            hidden
                            type="file"
                            multiple
                            onChange={(event) => {
                                const files = Array.from(event.target.files || []);
                                event.target.value = "";
                                if (files.length) void uploadFiles(files);
                            }}
                        />
                    </div>

                    <div className="mt-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
                                <button
                                    type="button"
                                    className="rounded-md px-1.5 py-0.5 text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                                    onClick={() => goToPrefix("")}
                                >
                                    {objectStorage.bucket || t("storageManager.root")}
                                </button>
                                {crumbs.map((crumb) => (
                                    <span key={crumb.prefix} className="inline-flex items-center gap-1">
                                        <ChevronRight className="size-3.5 text-stone-400" />
                                        <button
                                            type="button"
                                            className={cn(
                                                "max-w-[10rem] truncate rounded-md px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800",
                                                crumb.prefix === prefix
                                                    ? "font-medium text-stone-900 dark:text-stone-100"
                                                    : "text-stone-600 dark:text-stone-300",
                                            )}
                                            onClick={() => goToPrefix(crumb.prefix)}
                                        >
                                            {crumb.label}
                                        </button>
                                    </span>
                                ))}
                            </nav>
                            <div className="flex items-center gap-2">
                                {someSelected ? (
                                    <Button danger icon={<Trash2 className="size-3.5" />} onClick={() => confirmDelete([...selected])}>
                                        {t("storageManager.deleteSelected", { count: selected.size })}
                                    </Button>
                                ) : null}
                                {rootPrefix && prefix !== rootPrefix ? (
                                    <Button onClick={() => goToPrefix(rootPrefix)}>{t("storageManager.gotoPrefix")}</Button>
                                ) : null}
                                <Tooltip title={t("storageManager.reload")}>
                                    <Button
                                        className="!h-8 !w-8 !min-w-8 !px-0"
                                        icon={<RefreshCw className={`size-3.5 ${loading || usageLoading || cdnLoading ? "animate-spin" : ""}`} />}
                                        aria-label={t("storageManager.reload")}
                                        onClick={() => {
                                            void loadListing();
                                            void loadUsage();
                                            void loadCdn();
                                        }}
                                    />
                                </Tooltip>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                size="middle"
                                value={prefixDraft}
                                placeholder={t("storageManager.prefixPlaceholder")}
                                onChange={(event) => setPrefixDraft(event.target.value)}
                                onPressEnter={() => goToPrefix(prefixDraft)}
                                className="!max-w-xl !flex-1"
                                allowClear
                            />
                            <Button type="primary" onClick={() => goToPrefix(prefixDraft)}>
                                {t("storageManager.gotoFolder")}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200/80 dark:border-stone-700/80">
                        <div className="flex items-center gap-3 border-b border-stone-200/80 bg-stone-50/80 px-4 py-2.5 text-xs font-medium text-stone-500 dark:border-stone-700/80 dark:bg-stone-900/40 dark:text-stone-400">
                            <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} disabled={!visibleObjectKeys.length} />
                            <span className="min-w-0 flex-1">{t("storageManager.colName")}</span>
                            <span className="hidden w-24 text-right sm:block">{t("storageManager.colSize")}</span>
                            <span className="hidden w-44 text-right md:block">{t("storageManager.colModified")}</span>
                            <span className="w-28 text-right">{t("storageManager.colActions")}</span>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-20">
                                <Spin />
                            </div>
                        ) : error && !rows.length ? (
                            <Empty className="py-16" description={error} />
                        ) : !rows.length ? (
                            <Empty className="py-16" description={t("storageManager.empty")} />
                        ) : (
                            <ul className="divide-y divide-stone-200/70 dark:divide-stone-800">
                                {pageRows.map((row) => {
                                    if (row.kind === "folder") {
                                        return (
                                            <li key={`folder:${row.key}`}>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50 dark:hover:bg-stone-900/50"
                                                    onClick={() => goToPrefix(row.key)}
                                                >
                                                    <span className="w-4" />
                                                    <Folder className="size-4 shrink-0 text-amber-600/80 dark:text-amber-400/80" />
                                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{folderLabel(row.key, prefix)}</span>
                                                    <span className="hidden w-24 sm:block" />
                                                    <span className="hidden w-44 md:block" />
                                                    <span className="w-28 text-right text-xs text-stone-400">{t("storageManager.folder")}</span>
                                                </button>
                                            </li>
                                        );
                                    }
                                    const item = row.item;
                                    const checked = selected.has(item.key);
                                    const canPreview = guessPreviewKind(item.key) !== "other";
                                    return (
                                        <li key={item.key} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-900/50">
                                            <Checkbox checked={checked} onChange={() => toggleKey(item.key)} />
                                            <button
                                                type="button"
                                                className="min-w-0 flex-1 text-left"
                                                onClick={() => setPreviewKey(item.key)}
                                            >
                                                <div className="truncate text-sm font-medium">{fileNameFromKey(item.key, prefix)}</div>
                                                <div className="truncate text-[11px] text-stone-400">{item.key}</div>
                                            </button>
                                            <span className="hidden w-24 text-right text-xs text-stone-500 sm:block">{displayBytes(item.size)}</span>
                                            <span className="hidden w-44 text-right text-xs text-stone-500 md:block">
                                                {item.lastModified ? new Date(item.lastModified).toLocaleString() : "—"}
                                            </span>
                                            <div className="flex w-28 justify-end gap-0.5">
                                                <Tooltip title={t("storageManager.preview")}>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        className="!px-1.5"
                                                        disabled={!canPreview}
                                                        icon={<Eye className="size-3.5" />}
                                                        aria-label={t("storageManager.preview")}
                                                        onClick={() => setPreviewKey(item.key)}
                                                    />
                                                </Tooltip>
                                                <Tooltip title={t("storageManager.copyUrl")}>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        className="!px-1.5"
                                                        icon={<Copy className="size-3.5" />}
                                                        aria-label={t("storageManager.copyUrl")}
                                                        onClick={() => openUrl(item.key)}
                                                    />
                                                </Tooltip>
                                                <Tooltip title={t("storageManager.openUrl")}>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        className="!px-1.5"
                                                        icon={<Link2 className="size-3.5" />}
                                                        aria-label={t("storageManager.openUrl")}
                                                        onClick={() => window.open(buildObjectAccessUrl(objectStorage, item.key), "_blank", "noopener,noreferrer")}
                                                    />
                                                </Tooltip>
                                                <Tooltip title={t("storageManager.delete")}>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        className="!px-1.5"
                                                        icon={<Trash2 className="size-3.5" />}
                                                        aria-label={t("storageManager.delete")}
                                                        onClick={() => confirmDelete([item.key])}
                                                    />
                                                </Tooltip>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 px-4 py-3 dark:border-stone-700/80">
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                                <span>{t("storageManager.pageTotal", { count: rows.length })}</span>
                                {hasMore ? (
                                    <Button size="small" loading={loadingMore} onClick={() => void loadListing({ append: true, token: continuationToken })}>
                                        {t("storageManager.loadMore")}
                                    </Button>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Select
                                    size="small"
                                    value={pageSize}
                                    options={PAGE_SIZE_OPTIONS.map((value) => ({
                                        value,
                                        label: t("storageManager.pageSize", { count: value }),
                                    }))}
                                    onChange={(value) => {
                                        setPageSize(value);
                                        setPage(1);
                                    }}
                                    className="!w-[7.5rem]"
                                />
                                <Pagination
                                    size="small"
                                    current={page}
                                    pageSize={pageSize}
                                    total={hasMore ? Math.max(rows.length + pageSize, page * pageSize) : rows.length}
                                    showSizeChanger={false}
                                    onChange={(next) => void ensurePageLoaded(next)}
                                />
                                <div className="flex items-center gap-1 text-xs text-stone-500">
                                    <span>{t("storageManager.pageJump")}</span>
                                    <Input
                                        size="small"
                                        value={pageJumpDraft}
                                        onChange={(event) => setPageJumpDraft(event.target.value.replace(/[^\d]/g, ""))}
                                        onPressEnter={jumpToPage}
                                        className="!w-14"
                                        inputMode="numeric"
                                    />
                                    <Button size="small" loading={loadingMore} onClick={jumpToPage}>
                                        {t("storageManager.pageJumpGo")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                                    </>
                                ),
                            },
                            {
                                key: "cdn",
                                label: t("storageManager.tabCdn"),
                                children: (
                                    <div className="space-y-4 pb-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Select
                                                size="middle"
                                                value={cdnRangePreset}
                                                options={[
                                                    { value: "today", label: t("storageManager.cdnPreset.today") },
                                                    { value: "yesterday", label: t("storageManager.cdnPreset.yesterday") },
                                                    { value: "7d", label: t("storageManager.cdnPreset.7d") },
                                                    { value: "30d", label: t("storageManager.cdnPreset.30d") },
                                                    { value: "custom", label: t("storageManager.cdnPreset.custom") },
                                                ]}
                                                onChange={(value: CdnRangePreset) => {
                                                    setCdnRangePreset(value);
                                                    if (value === "today" || value === "yesterday") {
                                                        setCdnDays(1);
                                                        if (cdnInterval === "month") setCdnInterval("hour");
                                                    } else if (value === "7d") {
                                                        setCdnDays(7);
                                                        if (cdnInterval === "month") setCdnInterval("day");
                                                    } else if (value === "30d") {
                                                        setCdnDays(30);
                                                        if (cdnInterval === "month") setCdnInterval("day");
                                                    } else if (value === "custom" && !cdnCustomRange) {
                                                        setCdnCustomRange([dayjs().subtract(6, "day"), dayjs()]);
                                                    }
                                                }}
                                                className="!min-w-[8.5rem]"
                                            />
                                            {cdnRangePreset === "custom" ? (
                                                <DatePicker.RangePicker
                                                    size="middle"
                                                    value={cdnCustomRange}
                                                    allowClear={false}
                                                    disabledDate={(current) => Boolean(current && current > dayjs().endOf("day"))}
                                                    onChange={(value) => {
                                                        if (value?.[0] && value?.[1]) setCdnCustomRange([value[0], value[1]]);
                                                    }}
                                                    className="!min-w-[16rem]"
                                                />
                                            ) : null}
                                            <Select
                                                size="middle"
                                                value={cdnInterval}
                                                options={CDN_INTERVAL_OPTIONS.map((value) => ({
                                                    value,
                                                    label: t(`storageManager.cdnInterval.${value}`),
                                                }))}
                                                onChange={(value) => {
                                                    const next = normalizeCdnInterval(value);
                                                    setCdnInterval(next);
                                                    if (next === "month") {
                                                        setCdnDays(defaultCdnRangeUnits("month"));
                                                        if (cdnRangePreset === "today" || cdnRangePreset === "yesterday" || cdnRangePreset === "7d" || cdnRangePreset === "30d") {
                                                            setCdnRangePreset("custom");
                                                            setCdnCustomRange([dayjs().subtract(5, "month").startOf("month"), dayjs()]);
                                                        }
                                                    } else if (cdnRangePreset === "7d" || cdnRangePreset === "30d") {
                                                        const options = cdnRangeOptions(next);
                                                        setCdnDays((prev) => (options.includes(prev) ? prev : defaultCdnRangeUnits(next)));
                                                    }
                                                }}
                                                className="!min-w-[7.5rem]"
                                            />
                                            <Button
                                                icon={<RefreshCw className={`size-3.5 ${cdnLoading ? "animate-spin" : ""}`} />}
                                                onClick={() => void loadCdn()}
                                            >
                                                {t("storageManager.reload")}
                                            </Button>
                                            <div className="ml-auto text-xs text-stone-500 dark:text-stone-400">
                                                {cdn?.domain ? `CDN: ${cdn.domain}` : t("storageManager.cdnNeedDomain")}
                                            </div>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                            <StatCard
                                                label={t("storageManager.bucketCapacity")}
                                                value={usageLoading && !usage ? "…" : formatCdnTraffic(usage?.totalBytes || 0)}
                                                hint={
                                                    usage
                                                        ? t("storageManager.objectCount", { count: usage.objectCount })
                                                        : t("storageManager.usageEmpty")
                                                }
                                            />
                                            <StatCard
                                                label={t("storageManager.cdnTraffic")}
                                                value={cdnLoading && !cdn ? "…" : formatCdnTraffic(cdn?.bytesTotal || 0)}
                                                hint={
                                                    typeof cdn?.requestCount === "number"
                                                        ? t("storageManager.requestCount", { count: cdn.requestCount })
                                                        : cdnInterval === "month"
                                                          ? t("storageManager.cdnRangeMonths", { count: cdnDays })
                                                          : t("storageManager.cdnRangeDays", { count: cdnDays })
                                                }
                                            />
                                            <StatCard
                                                label={t("storageManager.peakBandwidth")}
                                                value={formatBandwidth(cdn?.peakBandwidthBps)}
                                                hint={
                                                    typeof cdn?.hitRate === "number"
                                                        ? t("storageManager.hitRate", { rate: cdn.hitRate.toFixed(1) })
                                                        : t("storageManager.cdnTrafficToday") + `: ${cdnValue}`
                                                }
                                            />
                                            <StatCard
                                                label={t("storageManager.downloadTraffic")}
                                                value={formatCdnTraffic(
                                                    (cdn?.downloadSeries || cdn?.series || []).reduce((sum, point) => sum + (point.bytes || 0), 0),
                                                )}
                                                hint={t("storageManager.uploadTraffic") + `: ${formatCdnTraffic((cdn?.uploadSeries || []).reduce((sum, point) => sum + (point.bytes || 0), 0))}`}
                                            />
                                            <StatCard
                                                label={t("storageManager.originTraffic")}
                                                value={formatCdnTraffic((cdn?.originSeries || []).reduce((sum, point) => sum + (point.bytes || 0), 0))}
                                                hint={
                                                    typeof cdn?.originRequestCount === "number"
                                                        ? t("storageManager.requestCount", { count: cdn.originRequestCount })
                                                        : (cdn?.originSeries?.length
                                                              ? t("storageManager.cdnWindowTotal")
                                                              : t("storageManager.originEmpty"))
                                                }
                                            />
                                        </div>

                                        <div>
                                            <div className="mb-2 text-sm font-medium">{t("storageManager.cdnTrendTitle")}</div>
                                            {cdnLoading && !(cdn?.series?.length) ? (
                                                <div className="flex justify-center py-16">
                                                    <Spin />
                                                </div>
                                            ) : cdn?.error === "missing-domain" || cdn?.error === "unsupported-provider" || cdn?.error ? (
                                                <Empty
                                                    className="py-12"
                                                    description={
                                                        cdn.error === "missing-domain"
                                                            ? t("storageManager.cdnNeedDomainHint")
                                                            : cdn.error === "unsupported-provider"
                                                              ? t("storageManager.cdnUnsupportedHint")
                                                              : cdn.error
                                                    }
                                                />
                                            ) : (
                                                <CdnTrafficChart
                                                    lines={(() => {
                                                        const edge = cdn?.series || [];
                                                        const download = cdn?.downloadSeries || [];
                                                        const upload = cdn?.uploadSeries || [];
                                                        const origin = cdn?.originSeries || [];
                                                        const sameAsEdge = (points: typeof edge) =>
                                                            points.length === edge.length &&
                                                            points.every((point, index) => point.time === edge[index]?.time && point.bytes === edge[index]?.bytes);
                                                        return [
                                                            {
                                                                key: "cdn",
                                                                label: t("storageManager.cdnTraffic"),
                                                                color: "#2563eb",
                                                                points: edge,
                                                            },
                                                            download.length && !sameAsEdge(download)
                                                                ? {
                                                                      key: "download",
                                                                      label: t("storageManager.downloadTraffic"),
                                                                      color: "#38bdf8",
                                                                      points: download,
                                                                  }
                                                                : null,
                                                            upload.length
                                                                ? {
                                                                      key: "upload",
                                                                      label: t("storageManager.uploadTraffic"),
                                                                      color: "#f59e0b",
                                                                      points: upload,
                                                                  }
                                                                : null,
                                                            origin.length
                                                                ? {
                                                                      key: "origin",
                                                                      label: t("storageManager.originTraffic"),
                                                                      color: "#22c55e",
                                                                      points: origin,
                                                                  }
                                                                : null,
                                                        ].filter((line): line is NonNullable<typeof line> => Boolean(line));
                                                    })()}
                                                    emptyLabel={t("storageManager.cdnTrendEmpty")}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            </main>

            <Modal
                open={Boolean(previewKey)}
                title={previewKey ? fileNameFromKey(previewKey, prefix) : t("storageManager.preview")}
                onCancel={() => setPreviewKey(null)}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => previewKey && openUrl(previewKey)}>{t("storageManager.copyUrl")}</Button>
                        <Button type="primary" onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")}>
                            {t("storageManager.openUrl")}
                        </Button>
                    </div>
                }
                width={Math.min(920, typeof window !== "undefined" ? window.innerWidth - 48 : 920)}
                destroyOnHidden
            >
                {previewKey ? (
                    <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl bg-stone-100/80 dark:bg-stone-900/60">
                        {previewKind === "image" ? (
                            <img src={previewUrl} alt={previewKey} className="max-h-[70vh] max-w-full object-contain" />
                        ) : previewKind === "video" ? (
                            <video src={previewUrl} controls className="max-h-[70vh] max-w-full" />
                        ) : previewKind === "audio" ? (
                            <audio src={previewUrl} controls className="w-full" />
                        ) : previewKind === "text" ? (
                            <iframe title={previewKey} src={previewUrl} className="h-[70vh] w-full rounded-lg border-0 bg-white dark:bg-stone-950" />
                        ) : (
                            <div className="px-6 py-10 text-center text-sm text-stone-500">
                                <p>{t("storageManager.previewUnsupported")}</p>
                                <a className="mt-3 inline-block text-sky-600 hover:underline" href={previewUrl} target="_blank" rel="noreferrer">
                                    {previewUrl}
                                </a>
                            </div>
                        )}
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}

function StatCard(props: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3 dark:border-stone-700/80 dark:bg-stone-900/40">
            <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{props.label}</div>
            <div className="mt-1 truncate text-lg font-semibold tracking-tight">{props.value}</div>
            {props.hint ? <div className="mt-0.5 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">{props.hint}</div> : null}
        </div>
    );
}
