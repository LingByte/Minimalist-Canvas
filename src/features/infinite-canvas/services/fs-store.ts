import localforage from "localforage";

export const STORAGE_ROOT_KEY = "minimalist-canvas:storage-root";
const MIGRATION_FLAG = ".idb-migrated";
const INDEX_FILE = "index.json";

type FsEntry = { file: string; mime?: string; bytes: number };
type FsIndex = Record<string, FsEntry>;

type StoreMode = "json" | "blob" | "raw";

export interface KvStore {
    getItem<T = unknown>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
    keys(): Promise<string[]>;
    iterate<T, U>(callback: (value: T, key: string, index: number) => U | void): Promise<U | undefined>;
    clear(): Promise<void>;
    length(): Promise<number>;
}

export interface BlobStore {
    getItem<T extends Blob = Blob>(key: string): Promise<T | null>;
    setItem<T extends Blob>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
    keys(): Promise<string[]>;
    iterate<T = Blob, U = void>(callback: (value: T, key: string, index: number) => U | void): Promise<U | undefined>;
    clear(): Promise<void>;
    length(): Promise<number>;
}

export function isTauri() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function customStorageRoot() {
    try {
        return localStorage.getItem(STORAGE_ROOT_KEY) || "";
    } catch {
        return "";
    }
}

let rootPromise: Promise<string> | null = null;

/** Resolved storage root: custom dir if configured, otherwise the Tauri app data dir. */
export function storageRoot(): Promise<string> {
    if (!isTauri()) return Promise.resolve("");
    rootPromise ||= (async () => {
        const custom = customStorageRoot();
        if (custom) return custom;
        const { appDataDir } = await import("@tauri-apps/api/path");
        return appDataDir();
    })();
    return rootPromise;
}

async function joinPath(...parts: string[]) {
    const { join } = await import("@tauri-apps/api/path");
    return join(...parts);
}

function sanitizeSegment(value: string) {
    return value.replace(/[\\/:*?"<>|\s]/g, "_");
}

function blobExtension(mime: string) {
    const type = (mime || "").toLowerCase();
    if (type.includes("png")) return "png";
    if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    if (type.includes("mp4")) return "mp4";
    if (type.includes("webm")) return "webm";
    if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
    if (type.includes("wav")) return "wav";
    if (type.includes("ogg")) return "ogg";
    if (type.includes("svg")) return "svg";
    if (type.includes("json")) return "json";
    if (type.includes("pdf")) return "pdf";
    if (type.startsWith("text/")) return "txt";
    return "bin";
}

// --- fs primitives (lazy plugin imports so web builds never touch Tauri) ---

const fs = () => import("@tauri-apps/plugin-fs");

async function ensureDir(path: string) {
    const { mkdir, exists } = await fs();
    if (!(await exists(path))) await mkdir(path, { recursive: true });
}

async function readBytes(path: string) {
    const { readFile } = await fs();
    return readFile(path);
}

async function writeBytes(path: string, data: Uint8Array) {
    const { writeFile } = await fs();
    return writeFile(path, data);
}

async function readText(path: string) {
    const { readTextFile } = await fs();
    return readTextFile(path);
}

async function writeText(path: string, data: string) {
    const { writeTextFile } = await fs();
    return writeTextFile(path, data);
}

async function pathExists(path: string) {
    const { exists } = await fs();
    return exists(path);
}

async function removePath(path: string) {
    const { remove, exists } = await fs();
    if (await exists(path)) await remove(path, { recursive: true });
}

const encoder = new TextEncoder();

// --- per-collection index cache + write serialization ---

const indexCache = new Map<string, FsIndex>();
const dirReady = new Set<string>();
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(queueKey: string, job: () => Promise<T>): Promise<T> {
    const prev = writeQueues.get(queueKey) || Promise.resolve();
    const next = prev.then(job, job);
    writeQueues.set(queueKey, next.catch(() => undefined));
    return next;
}

async function collectionDir(name: string) {
    const root = await storageRoot();
    const dir = await joinPath(root, ...name.split("/").map(sanitizeSegment));
    if (!dirReady.has(dir)) {
        await ensureDir(dir);
        dirReady.add(dir);
    }
    return dir;
}

async function loadIndex(dir: string): Promise<FsIndex> {
    const cached = indexCache.get(dir);
    if (cached) return cached;
    let index: FsIndex = {};
    const indexPath = await joinPath(dir, INDEX_FILE);
    try {
        if (await pathExists(indexPath)) index = JSON.parse(await readText(indexPath)) as FsIndex;
    } catch {
        index = {};
    }
    indexCache.set(dir, index);
    return index;
}

async function saveIndex(dir: string, index: FsIndex) {
    indexCache.set(dir, index);
    const tmp = await joinPath(dir, `${INDEX_FILE}.tmp`);
    await writeText(tmp, JSON.stringify(index));
    const { rename } = await fs();
    await rename(tmp, await joinPath(dir, INDEX_FILE));
}

function entryFileName(key: string, mime?: string) {
    const safe = sanitizeSegment(key) || "item";
    return mime === undefined ? `${safe}.json` : `${safe}.${blobExtension(mime)}`;
}

// --- collections ---

function fsCollection(name: string, mode: StoreMode, gated: boolean): KvStore & BlobStore {
    async function persistEntry(key: string, file: string, mime: string | undefined, bytes: number) {
        const dir = await collectionDir(name);
        const index = await loadIndex(dir);
        index[key] = { file, mime, bytes };
        await saveIndex(dir, index);
    }

    async function dropEntry(key: string) {
        const dir = await collectionDir(name);
        const index = await loadIndex(dir);
        delete index[key];
        await saveIndex(dir, index);
    }

    const store: KvStore & BlobStore = {
        async getItem<T>(key: string) {
            if (gated) await ensureStorageReady();
            return enqueue(name, async () => {
                const dir = await collectionDir(name);
                const entry = (await loadIndex(dir))[key];
                if (!entry) return null;
                const path = await joinPath(dir, entry.file);
                if (!(await pathExists(path))) {
                    delete indexCache.get(dir)![key];
                    return null;
                }
                if (mode === "blob") return new Blob([await readBytes(path) as BlobPart], { type: entry.mime || "application/octet-stream" }) as unknown as T;
                const text = await readText(path);
                return (mode === "raw" ? text : JSON.parse(text)) as T;
            });
        },

        async setItem<T>(key: string, value: T) {
            if (gated) await ensureStorageReady();
            return enqueue(name, async () => {
                const dir = await collectionDir(name);
                const previous = (await loadIndex(dir))[key];
                if (mode === "blob") {
                    const blob = value as Blob;
                    const mime = blob.type || "application/octet-stream";
                    const file = entryFileName(key, mime);
                    if (previous && previous.file !== file) await removePath(await joinPath(dir, previous.file));
                    await writeBytes(await joinPath(dir, file), new Uint8Array(await blob.arrayBuffer()));
                    await persistEntry(key, file, mime, blob.size);
                    return value;
                }
                const file = entryFileName(key);
                const text = mode === "raw" ? String(value) : JSON.stringify(value);
                await writeText(await joinPath(dir, file), text);
                await persistEntry(key, file, undefined, encoder.encode(text).byteLength);
                return value;
            });
        },

        async removeItem(key: string) {
            if (gated) await ensureStorageReady();
            return enqueue(name, async () => {
                const dir = await collectionDir(name);
                const entry = (await loadIndex(dir))[key];
                if (entry) await removePath(await joinPath(dir, entry.file));
                await dropEntry(key);
            });
        },

        async keys() {
            if (gated) await ensureStorageReady();
            return enqueue(name, async () => Object.keys(await loadIndex(await collectionDir(name))));
        },

        async iterate<T, U>(callback: (value: T, key: string, index: number) => U | void) {
            if (gated) await ensureStorageReady();
            const keys = await store.keys();
            let i = 0;
            for (const key of keys) {
                const value = await store.getItem<T>(key);
                const result = await callback(value as T, key, (i += 1));
                if (result !== undefined) return result;
            }
            return undefined;
        },

        async clear() {
            if (gated) await ensureStorageReady();
            return enqueue(name, async () => {
                const dir = await collectionDir(name);
                await removePath(dir);
                dirReady.delete(dir);
                indexCache.delete(dir);
                await ensureDir(dir);
                dirReady.add(dir);
            });
        },

        async length() {
            if (gated) await ensureStorageReady();
            return enqueue(name, async () => Object.keys(await loadIndex(await collectionDir(name))).length);
        },
    };
    return store;
}

function localforageCollection(name: string): KvStore & BlobStore {
    const instance = localforage.createInstance({ name: "minimalist-canvas", storeName: sanitizeSegment(name) });
    return instance as unknown as KvStore & BlobStore;
}

const collections = new Map<string, KvStore & BlobStore>();

/** `gated: false` is for the migration itself — it must not wait on its own completion. */
function collection(name: string, mode: StoreMode, gated = true): KvStore & BlobStore {
    const cacheKey = `${mode}:${name}:${gated ? 1 : 0}`;
    let store = collections.get(cacheKey);
    if (!store) {
        store = isTauri() ? fsCollection(name, mode, gated) : localforageCollection(name);
        collections.set(cacheKey, store);
    }
    return store;
}

/** JSON-record store (generation logs, plugin KV, misc). */
export function kvStore(name: string): KvStore {
    return collection(name, "json");
}

/** Binary store for image/audio/video blobs. */
export function blobStore(name: string): BlobStore {
    return collection(name, "blob");
}

/** Raw-string store for zustand persist values (StateStorage-compatible). */
export const appStateStorage = {
    getItem: (name: string) => collection("app_state", "raw").getItem<string>(name),
    setItem: (name: string, value: string) => collection("app_state", "raw").setItem(name, value),
    removeItem: (name: string) => collection("app_state", "raw").removeItem(name),
};

// --- one-time IndexedDB/localStorage → filesystem migration ---

let readyPromise: Promise<void> | null = null;

export function ensureStorageReady(): Promise<void> {
    if (!isTauri()) return Promise.resolve();
    readyPromise ||= migrateLegacyData().catch((error) => {
        console.error("[fs-store] legacy data migration failed", error);
    });
    return readyPromise;
}

const LEGACY_LOCALSTORAGE_KEYS = ["minimalist-canvas:ai_config_store", "minimalist-canvas:theme_store", "system-config-storage"];

async function migrateLegacyData() {
    // Honor a customDataDir chosen before file storage existed: seed the pointer
    // before the first storageRoot() resolution so all data lands there directly.
    await seedStorageRootPointer();
    const root = await storageRoot();
    try {
        const flag = await joinPath(root, MIGRATION_FLAG);
        await ensureDir(root);
        if (await pathExists(flag)) return;

        const errors: unknown[] = [];
        for (const migrate of [migrateMainDatabase, migratePluginDatabase]) {
            try {
                await migrate();
            } catch (error) {
                errors.push(error);
                console.error("[fs-store] migration step failed", error);
            }
        }
        // localStorage holds the latest values for the sync-persist keys — it must
        // win over any stale copies that lived in IndexedDB's app_state store.
        try {
            await migrateLocalStorageState();
        } catch (error) {
            errors.push(error);
            console.error("[fs-store] migration step failed", error);
        }
        if (errors.length) throw errors[0];
        await writeText(flag, new Date().toISOString());
    } catch (error) {
        // Surface the failure next to the data so a partial migration is debuggable.
        const detail = error instanceof Error ? error.stack || error.message : String(error);
        await writeText(await joinPath(root, ".idb-migration-error.txt"), detail).catch(() => undefined);
        throw error;
    }
}

async function seedStorageRootPointer() {
    if (customStorageRoot()) return;
    try {
        const raw = localStorage.getItem("minimalist-canvas:ai_config_store");
        const dir = raw ? (JSON.parse(raw) as { state?: { config?: { customDataDir?: unknown } } })?.state?.config?.customDataDir : "";
        if (typeof dir === "string" && dir) {
            await ensureDir(dir);
            localStorage.setItem(STORAGE_ROOT_KEY, dir);
            rootPromise = Promise.resolve(dir);
        }
    } catch {
        // Fall back to the default app data dir when the custom dir is unusable.
    }
}

function openDatabase(name: string) {
    return new Promise<IDBDatabase | null>((resolve) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(name);
        } catch {
            return resolve(null);
        }
        request.onerror = () => resolve(null);
        request.onupgradeneeded = () => {
            request.transaction?.abort();
            resolve(null);
        };
        request.onsuccess = () => resolve(request.result);
    });
}

function readAllEntries(db: IDBDatabase, storeName: string) {
    return new Promise<Array<[string, unknown]>>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const entries: Array<[string, unknown]> = [];
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve(entries);
            entries.push([String(cursor.key), cursor.value]);
            cursor.continue();
        };
    });
}

async function migrateMainDatabase() {
    const db = await openDatabase("minimalist-canvas");
    if (!db) return;
    try {
        for (const storeName of Array.from(db.objectStoreNames)) {
            const entries = await readAllEntries(db, storeName);
            if (!entries.length) continue;
            if (storeName === "app_state") {
                await Promise.all(entries.map(([key, value]) => collection("app_state", "raw", false).setItem(key, typeof value === "string" ? value : JSON.stringify(value))));
            } else if (storeName === "image_files" || storeName === "media_files") {
                await Promise.all(
                    entries.map(([key, value]) => {
                        const blob = value instanceof Blob ? value : new Blob([value as ArrayBuffer]);
                        return collection(storeName, "blob", false).setItem(key, blob);
                    }),
                );
            } else {
                await Promise.all(
                    entries.map(([key, value]) =>
                        value instanceof Blob ? collection(storeName, "blob", false).setItem(key, value) : collection(storeName, "json", false).setItem(key, value),
                    ),
                );
            }
        }
    } finally {
        db.close();
    }
}

async function migratePluginDatabase() {
    const db = await openDatabase("minimalist-canvas-plugins");
    if (!db) return;
    try {
        for (const storeName of Array.from(db.objectStoreNames)) {
            const entries = await readAllEntries(db, storeName);
            await Promise.all(entries.map(([key, value]) => collection(`plugins/${storeName}`, "json", false).setItem(key, value)));
        }
    } finally {
        db.close();
    }
}

async function migrateLocalStorageState() {
    await Promise.all(
        LEGACY_LOCALSTORAGE_KEYS.map(async (key) => {
            const value = localStorage.getItem(key);
            if (value) await collection("app_state", "raw", false).setItem(key, value);
        }),
    );
}

// --- moving the storage root ---

async function copyTree(fromDir: string, toDir: string) {
    const { readDir, copyFile } = await fs();
    await ensureDir(toDir);
    for (const entry of await readDir(fromDir)) {
        const from = await joinPath(fromDir, entry.name);
        const to = await joinPath(toDir, entry.name);
        if (entry.isDirectory) await copyTree(from, to);
        else if (entry.isFile) await copyFile(from, to);
    }
}

/**
 * Move all app data to a new directory (or back to the default when `target` is empty).
 * Copies first, then switches the pointer, then removes the old tree.
 */
export async function moveStorageRoot(target: string) {
    await ensureStorageReady();
    const { appDataDir } = await import("@tauri-apps/api/path");
    const from = await storageRoot();
    const to = target || (await appDataDir());
    if (from === to) return;
    if (to.startsWith(`${from}/`) || from.startsWith(`${to}/`)) throw new Error("target directory must not be inside the current storage directory");
    await copyTree(from, to);
    if (target) localStorage.setItem(STORAGE_ROOT_KEY, target);
    else localStorage.removeItem(STORAGE_ROOT_KEY);
    rootPromise = Promise.resolve(to);
    indexCache.clear();
    dirReady.clear();
    await removePath(from);
}

// --- usage reporting ---

export type StoreUsage = { name: string; records: number; bytes: number };

async function duDirectory(path: string): Promise<{ files: number; bytes: number }> {
    const { readDir, stat } = await fs();
    let files = 0;
    let bytes = 0;
    if (!(await pathExists(path))) return { files, bytes };
    for (const entry of await readDir(path)) {
        const child = await joinPath(path, entry.name);
        if (entry.isDirectory) {
            const nested = await duDirectory(child);
            files += nested.files;
            bytes += nested.bytes;
        } else if (entry.isFile) {
            files += 1;
            bytes += (await stat(child)).size;
        }
    }
    return { files, bytes };
}

/** Per-store disk usage for the settings page. */
export async function readStoreUsages(): Promise<{ dataPath: string; stores: StoreUsage[]; totalBytes: number }> {
    const root = await storageRoot();
    if (!root || !(await pathExists(root))) return { dataPath: root, stores: [], totalBytes: 0 };
    const { readDir } = await fs();
    const stores: StoreUsage[] = [];
    let totalBytes = 0;
    for (const entry of await readDir(root)) {
        if (!entry.isDirectory) {
            if (entry.isFile) {
                const { stat } = await fs();
                totalBytes += (await stat(await joinPath(root, entry.name))).size;
            }
            continue;
        }
        const { files, bytes } = await duDirectory(await joinPath(root, entry.name));
        stores.push({ name: entry.name, records: files, bytes });
        totalBytes += bytes;
    }
    stores.sort((a, b) => b.bytes - a.bytes);
    return { dataPath: root, stores, totalBytes };
}

/** Per-canvas working directory (agent cwd, user files). Stable by project id. */
export async function canvasWorkspaceDir(projectId: string): Promise<string> {
    const dir = await joinPath(await storageRoot(), "workspaces", sanitizeSegment(projectId) || "default");
    await ensureDir(dir);
    return dir;
}

/** Mirror the live canvas snapshot into the workspace dir so the folder has real content and agents can read it as cwd context. */
export async function writeCanvasWorkspace(projectId: string, title: string, snapshot: unknown): Promise<void> {
    const dir = await canvasWorkspaceDir(projectId);
    await writeText(await joinPath(dir, "canvas.json"), JSON.stringify(snapshot, null, 2));
    const readmePath = await joinPath(dir, "README.md");
    if (!(await pathExists(readmePath))) {
        await writeText(readmePath, `# ${title || "Canvas"}\n\n画布工作区。canvas.json 是当前画布快照(节点/连线/视口),media/ 里是画布引用的图片/视频/音频备份,可作为 Agent 工作目录使用。\n`);
    }
}

/** Dump the blobs referenced by canvas nodes into <workspace>/media/. Write-once per blob key. */
export async function syncWorkspaceMedia(
    projectId: string,
    entries: Array<{ key: string; load: () => Promise<Blob | null> }>,
): Promise<void> {
    const mediaDir = await joinPath(await canvasWorkspaceDir(projectId), "media");
    await ensureDir(mediaDir);
    const { readDir } = await fs();
    const existing = new Set((await readDir(mediaDir)).map((entry) => entry.name));
    for (const entry of entries) {
        const prefix = `${sanitizeSegment(entry.key)}.`;
        if ([...existing].some((name) => name.startsWith(prefix))) continue;
        const blob = await entry.load().catch(() => null);
        if (!blob?.size) continue;
        const file = `${prefix}${blobExtension(blob.type)}`;
        await writeBytes(await joinPath(mediaDir, file), new Uint8Array(await blob.arrayBuffer()));
        existing.add(file);
    }
}
