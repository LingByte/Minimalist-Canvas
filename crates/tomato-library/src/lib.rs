//! Tomato (番茄) download platform client + local library storage.

mod book_dir;
mod client;
mod config;
mod download;
mod epub;
mod local;
mod runtime;

pub use book_dir::{
    delete_book, ensure_book_dir, import_epub_as_book_dir, is_book_dir, open_book, read_chapter,
};
pub use client::{PreviewResponse, SearchItem, SearchResponse, TomatoClient, cover_url_from_raw};
pub use config::{
    LOCAL_API_BASE, TomatoLibraryConfig, TomatoLibraryConfigManager, default_library_path,
    local_api_base,
};
pub use download::{
    DownloadProgressEvent, DownloadRequest, DownloadResult, download_book_to_library,
    download_book_to_library_with_progress,
};
pub use epub::{EpubBook, EpubChapter, EpubChapterMeta};
pub use local::{LocalBook, list_local_books, read_local_text, write_cover_bytes};
pub use runtime::{DownloaderPhase, DownloaderStatus, TomatoDownloaderRuntime, runtime};
