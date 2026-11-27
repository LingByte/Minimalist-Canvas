import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal, Progress, Segmented, Spin, Tag, Tooltip } from "antd";
import { BookOpen, ChevronLeft, ChevronRight, Download, FolderOpen, HardDriveDownload, Info, List, Play, RefreshCw, Search, Square, Trash2 } from "lucide-react";
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
    openNovelBook,
    previewNovel,
    readNovelChapter,
    revealLocalNovel,
    searchNovels,
    startDownloader,
    stopDownloader,
    type DownloaderStatus,
    type LocalNovel,
    type NovelBookView,
    type NovelChapter,
    type NovelDownloadProgress,
    type NovelPreview,
    type NovelSearchItem,
} from "@canvas/services/novel-library";
import { cn } from "@canvas/lib/utils";

function searchCover(item: NovelSearchItem) {
    return item.coverDataUrl || item.coverUrl || "";
}

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
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailItem, setDetailItem] = useState<NovelSearchItem | null>(null);
    const [detail, setDetail] = useState<NovelPreview | null>(null);
    const [readerOpen, setReaderOpen] = useState(false);
    const [readerLoading, setReaderLoading] = useState(false);
    const [chapterLoading, setChapterLoading] = useState(false);
    const [readerBook, setReaderBook] = useState<NovelBookView | null>(null);
    const [readerChapter, setReaderChapter] = useState<NovelChapter | null>(null);
    const [readerIndex, setReaderIndex] = useState(0);
    const [tocOpen, setTocOpen] = useState(true);

    const running = Boolean(downloader?.running) || downloader?.phase === "running";
    // Prefer running over install: a live local server may outlive the Child handle /
    // app restart, and `installed` can briefly read false while the port is still up.
    const needsInstall =
        !running && (!downloader?.installed || downloader.phase === "missing");
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
            setDetailOpen(false);
            setMode("local");
            await refreshLocal();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.download.failed"));
        } finally {
            setDownloadingId(null);
        }
    };

    const onOpenDetail = (item: NovelSearchItem) => {
        if (!running) {
            message.warning(t("novels.downloader.needRunning"));
            return;
        }
        // Show search payload immediately; preview enrichment is optional/background.
        setDetailItem(item);
        setDetail(null);
        setDetailOpen(true);
        setDetailLoading(true);
        void previewNovel(item.bookId)
            .then((preview) => {
                setDetail(preview);
                if (preview.coverDataUrl) {
                    setSearchItems((prev) =>
                        prev.map((entry) =>
                            entry.bookId === item.bookId
                                ? { ...entry, coverDataUrl: entry.coverDataUrl || preview.coverDataUrl }
                                : entry,
                        ),
                    );
                }
            })
            .catch(() => {
                // Search metadata is already enough for the modal.
            })
            .finally(() => setDetailLoading(false));
    };

    const loadChapter = useCallback(
        async (bookPath: string, index: number) => {
            setChapterLoading(true);
            try {
                const chapter = await readNovelChapter(bookPath, index);
                setReaderChapter(chapter);
                setReaderIndex(index);
            } catch (error) {
                message.error(error instanceof Error ? error.message : t("novels.local.chapterFailed"));
            } finally {
                setChapterLoading(false);
            }
        },
        [message, t],
    );

    const onRead = async (book: LocalNovel) => {
        setReaderOpen(true);
        setReaderLoading(true);
        setReaderBook(null);
        setReaderChapter(null);
        setTocOpen(true);
        try {
            const opened = await openNovelBook(book.path);
            setReaderBook(opened);
            if (opened.path !== book.path) {
                void refreshLocal();
            }
            const first = opened.chapters[0]?.index ?? 0;
            await loadChapter(opened.path, first);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("novels.local.readFailed"));
            setReaderOpen(false);
        } finally {
            setReaderLoading(false);
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

    const chapterMetaIndex = useMemo(() => {
        if (!readerBook) return -1;
        return readerBook.chapters.findIndex((chapter) => chapter.index === readerIndex);
    }, [readerBook, readerIndex]);

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
                                {running ? (
                                    <Button
                                        danger
                                        loading={busyAction === "stop"}
                                        icon={<Square className="size-3.5" />}
                                        onClick={() => void runDownloader("stop")}
                                    >
                                        {t("novels.downloader.stop")}
                                    </Button>
                                ) : needsInstall ? (
                                    <Button
                                        type="primary"
                                        loading={busyAction === "install"}
                                        icon={<HardDriveDownload className="size-3.5" />}
                                        onClick={() => void runDownloader("install")}
                                    >
                                        {t("novels.downloader.install")}
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
                                                <Button type="primary" size="small" icon={<BookOpen className="size-3.5" />} onClick={() => void onRead(book)}>
                                                    {t("novels.local.read")}
                                                </Button>
                                                <Button size="small" icon={<FolderOpen className="size-3.5" />} onClick={() => void revealLocalNovel(book.path)}>
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
                                const cover = searchCover(item);
                                return (
                                    <article
                                        key={item.bookId}
                                        className={cn(
                                            "flex gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-3 dark:border-stone-700/80 dark:bg-stone-900/50",
                                        )}
                                    >
                                        <div className="grid h-[7.5rem] w-[5.25rem] shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
                                            {cover ? (
                                                <img src={cover} alt="" className="size-full object-cover" loading="lazy" />
                                            ) : (
                                                <BookOpen className="size-5 text-stone-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-base font-semibold">{item.title}</div>
                                            <div className="mt-0.5 text-sm text-stone-500">
                                                {item.author || t("novels.search.unknownAuthor")}
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-stone-500">
                                                {item.chapterNumber ? (
                                                    <span>{t("novels.search.chapters", { count: item.chapterNumber })}</span>
                                                ) : null}
                                                {typeof item.finished === "boolean" ? (
                                                    <span>{item.finished ? t("novels.search.finished") : t("novels.search.ongoing")}</span>
                                                ) : null}
                                                {item.category ? <span className="truncate">{item.category}</span> : null}
                                            </div>
                                            {item.abstractText ? (
                                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{item.abstractText}</p>
                                            ) : null}
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <Button
                                                    size="small"
                                                    icon={<Info className="size-3.5" />}
                                                    onClick={() => onOpenDetail(item)}
                                                >
                                                    {t("novels.search.detail")}
                                                </Button>
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    loading={busy}
                                                    disabled={!running || Boolean(downloadingId)}
                                                    icon={<Download className="size-3.5" />}
                                                    onClick={() => void onDownload(item)}
                                                >
                                                    {busy ? t("novels.download.downloading") : t("novels.download.action")}
                                                </Button>
                                            </div>
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

            <Modal
                open={readerOpen}
                title={null}
                footer={null}
                onCancel={() => {
                    setReaderOpen(false);
                    setReaderBook(null);
                    setReaderChapter(null);
                }}
                width="min(1100px, 96vw)"
                centered
                destroyOnHidden
                styles={{ body: { padding: 0, height: "min(82vh, 860px)" } }}
                className="novel-reader-modal"
            >
                {readerLoading && !readerBook ? (
                    <div className="flex h-full items-center justify-center py-24">
                        <Spin />
                    </div>
                ) : readerBook ? (
                    <div className="flex h-full min-h-0 flex-col">
                        <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-semibold">{readerBook.title}</div>
                                <div className="mt-0.5 truncate text-xs text-stone-500">
                                    {readerBook.author || t("novels.search.unknownAuthor")}
                                    {readerBook.chapters.length
                                        ? ` · ${t("novels.local.readingProgress", {
                                              current: Math.max(1, chapterMetaIndex + 1),
                                              total: readerBook.chapters.length,
                                          })}`
                                        : ""}
                                </div>
                            </div>
                            <Button
                                size="small"
                                icon={<List className="size-3.5" />}
                                onClick={() => setTocOpen((open) => !open)}
                            >
                                {t("novels.local.chapterList")}
                            </Button>
                            <Button
                                size="small"
                                disabled={chapterMetaIndex <= 0 || chapterLoading}
                                icon={<ChevronLeft className="size-3.5" />}
                                onClick={() => {
                                    const prev = readerBook.chapters[chapterMetaIndex - 1];
                                    if (prev) void loadChapter(readerBook.path, prev.index);
                                }}
                            >
                                {t("novels.local.prevChapter")}
                            </Button>
                            <Button
                                size="small"
                                disabled={chapterMetaIndex < 0 || chapterMetaIndex >= readerBook.chapters.length - 1 || chapterLoading}
                                icon={<ChevronRight className="size-3.5" />}
                                onClick={() => {
                                    const next = readerBook.chapters[chapterMetaIndex + 1];
                                    if (next) void loadChapter(readerBook.path, next.index);
                                }}
                            >
                                {t("novels.local.nextChapter")}
                            </Button>
                        </header>
                        <div className="flex min-h-0 flex-1">
                            {tocOpen ? (
                                <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 dark:border-stone-800 sm:w-64">
                                    <div className="shrink-0 px-3 py-2 text-xs font-medium text-stone-500">
                                        {t("novels.local.chapterList")}
                                    </div>
                                    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
                                        {readerBook.chapters.length ? (
                                            readerBook.chapters.map((chapter) => (
                                                <button
                                                    key={chapter.index}
                                                    type="button"
                                                    className={cn(
                                                        "mb-0.5 w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                                                        chapter.index === readerIndex
                                                            ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                                                            : "text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800",
                                                    )}
                                                    onClick={() => void loadChapter(readerBook.path, chapter.index)}
                                                >
                                                    <span className="line-clamp-2">{chapter.title}</span>
                                                </button>
                                            ))
                                        ) : (
                                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("novels.local.noChapters")} />
                                        )}
                                    </div>
                                </aside>
                            ) : null}
                            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f7f4ef] px-5 py-6 dark:bg-stone-950 sm:px-10">
                                {chapterLoading && !readerChapter ? (
                                    <div className="flex justify-center py-20">
                                        <Spin />
                                    </div>
                                ) : readerChapter ? (
                                    <article className={cn("mx-auto max-w-2xl", chapterLoading && "opacity-60")}>
                                        <h2 className="mb-5 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                                            {readerChapter.title}
                                        </h2>
                                        <div className="whitespace-pre-wrap text-[15px] leading-8 text-stone-800 dark:text-stone-200">
                                            {readerChapter.text}
                                        </div>
                                    </article>
                                ) : (
                                    <Empty className="py-20" description={t("novels.local.noChapters")} />
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Modal>

            <Modal
                open={detailOpen}
                title={t("novels.search.detailTitle")}
                onCancel={() => setDetailOpen(false)}
                footer={
                    detailItem ? (
                        <div className="flex justify-end gap-2">
                            <Button onClick={() => setDetailOpen(false)}>{t("common.cancel")}</Button>
                            <Button
                                type="primary"
                                loading={downloadingId === detailItem.bookId}
                                disabled={!running || Boolean(downloadingId)}
                                icon={<Download className="size-3.5" />}
                                onClick={() => void onDownload(detailItem)}
                            >
                                {t("novels.download.action")}
                            </Button>
                        </div>
                    ) : null
                }
                width={720}
                destroyOnHidden
            >
                {detailItem ? (
                    <div className="flex flex-col gap-4 sm:flex-row">
                        <div className="mx-auto grid h-48 w-32 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800 sm:mx-0">
                            {detail?.coverDataUrl || searchCover(detailItem) ? (
                                <img
                                    src={detail?.coverDataUrl || searchCover(detailItem)}
                                    alt=""
                                    className="size-full object-cover"
                                />
                            ) : (
                                <BookOpen className="size-8 text-stone-400" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="text-xl font-semibold">{detail?.title || detailItem.title}</div>
                                    <div className="mt-1 text-sm text-stone-500">
                                        {detail?.author || detailItem.author || t("novels.search.unknownAuthor")}
                                    </div>
                                </div>
                                {detailLoading ? <Spin size="small" /> : null}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                                {(detail?.chapterCount || detailItem.chapterNumber) ? (
                                    <span>
                                        {t("novels.search.chapters", {
                                            count: detail?.chapterCount || detailItem.chapterNumber,
                                        })}
                                    </span>
                                ) : null}
                                {typeof (detail?.finished ?? detailItem.finished) === "boolean" ? (
                                    <span>
                                        {(detail?.finished ?? detailItem.finished)
                                            ? t("novels.search.finished")
                                            : t("novels.search.ongoing")}
                                    </span>
                                ) : null}
                                {detail?.wordCount ? (
                                    <span>{t("novels.search.words", { count: detail.wordCount })}</span>
                                ) : detailItem.wordNumber ? (
                                    <span>{t("novels.search.words", { count: detailItem.wordNumber })}</span>
                                ) : null}
                                {detail?.score ? <span>{t("novels.search.score", { score: detail.score })}</span> : null}
                                {detail?.readCountText ? <span>{detail.readCountText}</span> : null}
                            </div>
                            {(detail?.category || detailItem.category) ? (
                                <div className="text-sm">
                                    <span className="text-stone-500">{t("novels.search.category")}：</span>
                                    {detail?.category || detailItem.category}
                                </div>
                            ) : null}
                            {(detail?.tags?.length || detailItem.tags?.length) ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {(detail?.tags?.length ? detail.tags : detailItem.tags || []).map((tag) => (
                                        <Tag key={tag}>{tag}</Tag>
                                    ))}
                                </div>
                            ) : null}
                            <p className="whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">
                                {detail?.description || detailItem.abstractText || t("novels.search.noDescription")}
                            </p>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
