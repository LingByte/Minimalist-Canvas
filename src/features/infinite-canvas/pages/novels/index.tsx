import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Progress, Segmented, Spin, Tooltip } from "antd";
import { BookOpen, Download, FolderOpen, HardDriveDownload, Play, RefreshCw, Search, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isTauri } from "@canvas/services/fs-store";
import {
    deleteLocalNovel,
    downloadNovel,
    getDownloaderStatus,
    getNovelLibrarySettings,
    installDownloader,
    listenNovelDownloadProgress,
    listLocalNovels,
    openLocalNovel,
    revealLocalNovel,
    searchNovels,
    startDownloader,
    stopDownloader,
    type DownloaderStatus,
    type LocalNovel,
    type NovelDownloadProgress,
    type NovelSearchItem,
} from "@canvas/services/novel-library";
import { cn } from "@canvas/lib/utils";

type Mode = "local" | "search";

function formatBytes(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function phaseLabel(status: DownloaderStatus | null, t: (key: string) => string) {
    if (!status) return t("novels.downloader.unknown");
    return t(`novels.downloader.phase.${status.phase}`);
}

export default function NovelsPage() {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const desktop = isTauri();

    const [mode, setMode] = useState<Mode>("local");
    const [query, setQuery] = useState("");
    const [libraryPath, setLibraryPath] = useState("");
    const [downloader, setDownloader] = useState<DownloaderStatus | null>(null);
    const [localBooks, setLocalBooks] = useState<LocalNovel[]>([]);
    const [searchItems, setSearchItems] = useState<NovelSearchItem[]>([]);
    const [loadingLocal, setLoadingLocal] = useState(false);
    const [searching, setSearching] = useState(false);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [progress, setProgress] = useState<NovelDownloadProgress | null>(null);

    const running = Boolean(downloader?.running) || downloader?.phase === "running";
    const needsInstall = !downloader?.installed || downloader.phase === "missing";
    const downloaderBusy = ["installing", "starting", "stopping"].includes(downloader?.phase || "");

    const refreshDownloader = useCallback(async () => {
        if (!desktop) return;
        try {
            setDownloader(await getDownloaderStatus());
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.downloader.statusFailed"));
        }
    }, [desktop, message, t]);

    const refreshLocal = useCallback(async () => {
        if (!desktop) return;
        setLoadingLocal(true);
        try {
            const [settings, books] = await Promise.all([getNovelLibrarySettings(), listLocalNovels()]);
            setLibraryPath(settings.libraryPath || settings.defaultLibraryPath);
            setLocalBooks(books);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.local.loadFailed"));
        } finally {
            setLoadingLocal(false);
        }
    }, [desktop, message, t]);

    useEffect(() => {
        void refreshDownloader();
        void refreshLocal();
    }, [refreshDownloader, refreshLocal]);

    useEffect(() => {
        if (!desktop || !downloaderBusy) return;
        const timer = window.setInterval(() => void refreshDownloader(), 500);
        return () => window.clearInterval(timer);
    }, [desktop, downloaderBusy, refreshDownloader]);

    useEffect(() => {
        if (!desktop) return;
        let unlisten: (() => void) | undefined;
        void listenNovelDownloadProgress((event) => {
            setProgress(event);
            if (event.phase === "done" || event.phase === "failed") {
                setDownloadingId(null);
                void refreshLocal();
            }
        }).then((fn) => {
            unlisten = fn;
        });
        return () => {
            unlisten?.();
        };
    }, [desktop, refreshLocal]);

    const runDownloader = async (action: "install" | "start" | "stop") => {
        setBusyAction(action);
        try {
            if (action === "install") {
                const installed = await installDownloader();
                setDownloader(installed);
                const started = await startDownloader();
                setDownloader(started);
                if (started.running || started.phase === "running") {
                    message.success(t("novels.downloader.installStarted"));
                } else {
                    message.warning(started.message || t("novels.downloader.startPending"));
                }
                return;
            }
            const next = action === "start" ? await startDownloader() : await stopDownloader();
            setDownloader(next);
            if (action === "start") {
                if (next.running || next.phase === "running") message.success(t("novels.downloader.started"));
                else message.warning(next.message || t("novels.downloader.startPending"));
            } else {
                message.success(t("novels.downloader.stopped"));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.downloader.actionFailed"));
            await refreshDownloader();
        } finally {
            setBusyAction(null);
        }
    };

    const onSearch = async () => {
        const keyword = query.trim();
        if (!keyword) return;
        if (!running) {
            message.warning(t("novels.downloader.needRunning"));
            return;
        }
        setSearching(true);
        setMode("search");
        try {
            setSearchItems(await searchNovels(keyword));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.search.failed"));
        } finally {
            setSearching(false);
        }
    };

    const onDownload = async (item: NovelSearchItem) => {
        if (!running) {
            message.warning(t("novels.downloader.needRunning"));
            return;
        }
        setDownloadingId(item.bookId);
        setProgress({ bookId: item.bookId, title: item.title, phase: "queued", message: t("novels.download.queued") });
        try {
            const result = await downloadNovel({ bookId: item.bookId, preferredName: item.title });
            message.success(t("novels.download.success", { title: result.title || item.title }));
            setMode("local");
            await refreshLocal();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.download.failed"));
        } finally {
            setDownloadingId(null);
        }
    };

    const onDelete = (book: LocalNovel) => {
        modal.confirm({
            title: t("novels.local.deleteTitle", { name: book.name }),
            content: t("novels.local.deleteDesc"),
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteLocalNovel(book.path);
                    message.success(t("novels.local.deleted"));
                    await refreshLocal();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("novels.local.deleteFailed"));
                    throw error;
                }
            },
        });
    };

    const installProgress = useMemo(() => {
        if (downloader?.phase !== "installing") return null;
        const value = typeof downloader.installProgress === "number" ? Math.round(downloader.installProgress * 100) : undefined;
        return value;
    }, [downloader]);

    if (!desktop) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <Empty description={t("novels.desktopOnly")} />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1400px] space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">{t("novels.title")}</h1>
                            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("novels.subtitle")}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Tooltip title={libraryPath}>
                                <Button
                                    icon={<FolderOpen className="size-3.5" />}
                                    onClick={() => {
                                        if (libraryPath) void revealLocalNovel(libraryPath);
                                    }}
                                >
                                    {t("novels.openLibrary")}
                                </Button>
                            </Tooltip>
                            <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void refreshLocal()}>
                                {t("novels.refresh")}
                            </Button>
                        </div>
                    </div>

                    <section className="rounded-2xl border border-stone-200/80 bg-white/70 p-4 dark:border-stone-700/80 dark:bg-stone-900/40">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{t("novels.downloader.title")}</div>
                                <div className="mt-0.5 text-xs text-stone-500">
                                    {phaseLabel(downloader, t)}
                                    {downloader?.version ? ` · v${downloader.version}` : ""}
                                    {downloader?.message ? ` · ${downloader.message}` : ""}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {needsInstall ? (
                                    <Button
                                        type="primary"
                                        loading={busyAction === "install"}
                                        icon={<HardDriveDownload className="size-3.5" />}
                                        onClick={() => void runDownloader("install")}
                                    >
                                        {t("novels.downloader.install")}
                                    </Button>
                                ) : running ? (
                                    <Button
                                        danger
                                        loading={busyAction === "stop"}
                                        icon={<Square className="size-3.5" />}
                                        onClick={() => void runDownloader("stop")}
                                    >
                                        {t("novels.downloader.stop")}
                                    </Button>
                                ) : (
                                    <Button
                                        type="primary"
                                        loading={busyAction === "start"}
                                        icon={<Play className="size-3.5" />}
                                        onClick={() => void runDownloader("start")}
                                    >
                                        {t("novels.downloader.start")}
                                    </Button>
                                )}
                                <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void refreshDownloader()}>
                                    {t("novels.refresh")}
                                </Button>
                            </div>
                        </div>
                        {typeof installProgress === "number" ? (
                            <Progress className="mt-3" percent={installProgress} size="small" />
                        ) : null}
                        {progress && downloadingId ? (
                            <div className="mt-3 rounded-xl bg-stone-100/80 px-3 py-2 text-xs dark:bg-stone-800/60">
                                {progress.title} · {progress.phase}
                                {typeof progress.percent === "number" ? ` · ${progress.percent}%` : ""}
                                {progress.message ? ` · ${progress.message}` : ""}
                            </div>
                        ) : null}
                    </section>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Segmented
                            value={mode}
                            onChange={(value) => setMode(value as Mode)}
                            options={[
                                { label: t("novels.tabs.local"), value: "local" },
                                { label: t("novels.tabs.search"), value: "search" },
                            ]}
                        />
                        <Input.Search
                            allowClear
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onSearch={() => void onSearch()}
                            placeholder={t("novels.search.placeholder")}
                            enterButton={<Search className="size-3.5" />}
                            loading={searching}
                            className="min-w-0 flex-1"
                        />
                    </div>

                    {mode === "local" ? (
                        loadingLocal ? (
                            <div className="flex justify-center py-20">
                                <Spin />
                            </div>
                        ) : localBooks.length ? (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {localBooks.map((book) => (
                                    <article
                                        key={book.path}
                                        className="flex gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-3 dark:border-stone-700/80 dark:bg-stone-900/50"
                                    >
                                        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
                                            {book.coverDataUrl ? (
                                                <img src={book.coverDataUrl} alt="" className="size-full object-cover" />
                                            ) : (
                                                <BookOpen className="size-5 text-stone-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{book.name}</div>
                                            <div className="mt-0.5 text-xs text-stone-500">
                                                {book.ext.toUpperCase()} · {formatBytes(book.size)}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <Button size="small" onClick={() => void openLocalNovel(book.path)}>
                                                    {t("novels.local.open")}
                                                </Button>
                                                <Button size="small" onClick={() => void revealLocalNovel(book.path)}>
                                                    {t("novels.local.reveal")}
                                                </Button>
                                                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(book)} />
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <Empty className="py-16" description={t("novels.local.empty")} />
                        )
                    ) : searching ? (
                        <div className="flex justify-center py-20">
                            <Spin />
                        </div>
                    ) : searchItems.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {searchItems.map((item) => {
                                const busy = downloadingId === item.bookId;
                                return (
                                    <article
                                        key={item.bookId}
                                        className={cn(
                                            "flex flex-col rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-stone-700/80 dark:bg-stone-900/50",
                                        )}
                                    >
                                        <div className="truncate text-base font-semibold">{item.title}</div>
                                        <div className="mt-1 text-sm text-stone-500">{item.author || t("novels.search.unknownAuthor")}</div>
                                        <div className="mt-4">
                                            <Button
                                                type="primary"
                                                block
                                                loading={busy}
                                                disabled={!running || Boolean(downloadingId)}
                                                icon={<Download className="size-3.5" />}
                                                onClick={() => void onDownload(item)}
                                            >
                                                {busy ? t("novels.download.downloading") : t("novels.download.action")}
                                            </Button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <Empty className="py-16" description={running ? t("novels.search.empty") : t("novels.downloader.needRunning")} />
                    )}
                </div>
            </main>
        </div>
    );
}
