export const DEFAULT_FOLDER_PATH = "default";

export function normalizeFolderPath(raw?: string | null): string {
    if (!raw) return "";
    return raw
        .split(/[/\\]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join("/");
}

export function applyFolderToAssetFields(folderPath: string): {
    source: string;
    metadata: { folder: string };
} {
    const folder = normalizeFolderPath(folderPath) || DEFAULT_FOLDER_PATH;
    return {
        source: folder,
        metadata: { folder },
    };
}
