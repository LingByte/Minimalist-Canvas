import { isTauri, readStoreUsages } from "@canvas/services/fs-store";

export type IndexedDbStoreUsage = { name: string; records: number; bytes: number };
export type IndexedDbDatabaseUsage = { name: string; version: number; bytes: number; stores: IndexedDbStoreUsage[] };
export type LocalStorageUsage = { usage: number; quota: number; contentBytes: number; databases: IndexedDbDatabaseUsage[]; dataPath: string };

async function readDataPath(): Promise<string> {
    try {
        const { appDataDir } = await import("@tauri-apps/api/path");
        return await appDataDir();
    } catch {
        return "";
    }
}

export async function readLocalStorageUsage(): Promise<LocalStorageUsage> {
    if (isTauri()) {
        const [estimate, disk] = await Promise.all([navigator.storage.estimate(), readStoreUsages()]);
        return {
            usage: estimate.usage || 0,
            quota: estimate.quota || 0,
            contentBytes: disk.totalBytes,
            databases: [{ name: "minimalist-canvas", version: 1, bytes: disk.totalBytes, stores: disk.stores }],
            dataPath: disk.dataPath,
        };
    }
    const [estimate, database, dataPath] = await Promise.all([
        navigator.storage.estimate(),
        readDatabaseUsage("minimalist-canvas"),
        readDataPath(),
    ]);
    return { usage: estimate.usage || 0, quota: estimate.quota || 0, contentBytes: database.bytes, databases: [database], dataPath };
}

function readDatabaseUsage(name: string) {
    return new Promise<IndexedDbDatabaseUsage>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const database = request.result;
            const names = Array.from(database.objectStoreNames);
            if (!names.length) {
                database.close();
                resolve({ name, version: database.version, bytes: 0, stores: [] });
                return;
            }
            const transaction = database.transaction(names, "readonly");
            Promise.all(names.map((storeName) => readStoreUsage(transaction.objectStore(storeName))))
                .then((stores) => resolve({ name, version: database.version, bytes: stores.reduce((total, store) => total + store.bytes, 0), stores: stores.sort((a, b) => b.bytes - a.bytes) }))
                .catch(reject)
                .finally(() => database.close());
        };
    });
}

function readStoreUsage(store: IDBObjectStore) {
    return new Promise<IndexedDbStoreUsage>((resolve, reject) => {
        let records = 0;
        let bytes = 0;
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ name: store.name, records, bytes });
                return;
            }
            records += 1;
            bytes += valueBytes(cursor.value);
            cursor.continue();
        };
    });
}

function valueBytes(value: unknown) {
    if (value instanceof Blob) return value.size;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}
