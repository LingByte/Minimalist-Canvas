import { DEFAULT_FOLDER_PATH, normalizeFolderPath } from "./folder-path";

const STORAGE_KEY = "my-assets:folder-registry:v1";

function readRaw(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => normalizeFolderPath(String(item || ""))).filter(Boolean);
    } catch {
        return [];
    }
}

function writeRaw(paths: string[]) {
    if (typeof window === "undefined") return;
    const unique = Array.from(new Set(paths.map((path) => normalizeFolderPath(path)).filter(Boolean)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
}

export function listRegisteredFolders(): string[] {
    const paths = readRaw();
    if (!paths.includes(DEFAULT_FOLDER_PATH)) paths.unshift(DEFAULT_FOLDER_PATH);
    return paths;
}

export function registerFolder(path: string): string {
    const folder = normalizeFolderPath(path) || DEFAULT_FOLDER_PATH;
    const next = listRegisteredFolders();
    if (!next.includes(folder)) {
        next.push(folder);
        writeRaw(next);
    }
    return folder;
}

export function mergeFolderLists(...lists: string[][]): string[] {
    const set = new Set<string>([DEFAULT_FOLDER_PATH]);
    for (const list of lists) {
        for (const item of list) {
            const path = normalizeFolderPath(item);
            if (path) set.add(path);
        }
    }
    return Array.from(set);
}
