import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { isTauri } from "@canvas/services/fs-store";

export type DownloaderPhase = "missing" | "installing" | "ready" | "starting" | "running" | "stopping" | "error";

export type DownloaderStatus = {
    phase: DownloaderPhase;
    installed: boolean;
    running: boolean;
    version?: string | null;
    binaryPath?: string | null;
    apiBase: string;
    message?: string | null;
    installProgress?: number | null;
};

export type LibrarySettings = {
    apiBase: string;
    libraryPath: string;
    defaultLibraryPath: string;
};

export type LocalNovel = {
    name: string;
    path: string;
    ext: string;
    size: number;
    modifiedMs: number;
    coverPath?: string | null;
    coverDataUrl?: string | null;
};

export type NovelSearchItem = {
    title: string;
    author: string;
    bookId: string;
    coverUrl?: string | null;
    coverDataUrl?: string | null;
    abstractText?: string | null;
    category?: string | null;
    chapterNumber?: string | null;
    wordNumber?: string | null;
    score?: string | null;
    tags?: string[];
    finished?: boolean | null;
};

export type NovelPreview = {
    bookId: string;
    title: string;
    author: string;
    description: string;
    category: string;
    tags: string[];
    chapterCount: number;
    wordCount: number;
    score: number;
    readCountText: string;
    finished: boolean;
    firstChapterTitle: string;
    lastChapterTitle: string;
    coverUrl?: string | null;
    coverDataUrl?: string | null;
};

export type NovelDownloadProgress = {
    bookId: string;
    title: string;
    phase: string;
    message?: string | null;
    jobId?: number | null;
    percent?: number | null;
};

export type NovelDownloadResult = {
    job_id?: number;
    jobId?: number;
    title: string;
    author: string;
    local_path?: string;
    localPath?: string;
    format: string;
    size: number;
};

function requireDesktop() {
    if (!isTauri()) throw new Error("NOVEL_DESKTOP_ONLY");
}

export async function getNovelLibrarySettings() {
    requireDesktop();
    return invoke<LibrarySettings>("library_get_settings");
}

export async function setNovelLibraryPath(libraryPath: string) {
    requireDesktop();
    return invoke<LibrarySettings>("library_set_settings", { settings: { libraryPath } });
}

export async function listLocalNovels() {
    requireDesktop();
    return invoke<LocalNovel[]>("library_list_local");
}

export async function searchNovels(query: string) {
    requireDesktop();
    const result = await invoke<{ items: NovelSearchItem[] }>("library_search", { query });
    return result.items;
}

export async function previewNovel(bookId: string) {
    requireDesktop();
    return invoke<NovelPreview>("library_preview", { bookId });
}

export async function fetchNovelCoverDataUrl(args: { bookId?: string; coverUrl?: string | null }) {
    requireDesktop();
    return invoke<string | null>("library_cover_data_url", {
        args: {
            bookId: args.bookId,
            coverUrl: args.coverUrl || undefined,
        },
    });
}

export async function downloadNovel(args: {
    bookId: string;
    preferredName?: string;
    rangeStart?: number;
    rangeEnd?: number;
}) {
    requireDesktop();
    return invoke<NovelDownloadResult>("library_download", {
        args: {
            bookId: args.bookId,
            preferredName: args.preferredName,
            rangeStart: args.rangeStart,
            rangeEnd: args.rangeEnd,
        },
    });
}

export async function deleteLocalNovel(path: string) {
    requireDesktop();
    return invoke<void>("library_delete_local", { path });
}

export async function revealLocalNovel(path: string) {
    requireDesktop();
    return invoke<void>("library_reveal_local", { path });
}

export async function openLocalNovel(path: string) {
    requireDesktop();
    return invoke<void>("library_open_local", { path });
}

export async function getDownloaderStatus() {
    requireDesktop();
    return invoke<DownloaderStatus>("library_downloader_status");
}

export async function installDownloader() {
    requireDesktop();
    return invoke<DownloaderStatus>("library_install_downloader");
}

export async function startDownloader() {
    requireDesktop();
    return invoke<DownloaderStatus>("library_start_downloader");
}

export async function stopDownloader() {
    requireDesktop();
    return invoke<DownloaderStatus>("library_stop_downloader");
}

export async function listenNovelDownloadProgress(handler: (event: NovelDownloadProgress) => void): Promise<UnlistenFn> {
    requireDesktop();
    return listen<NovelDownloadProgress>("library-download-progress", (event) => handler(event.payload));
}
