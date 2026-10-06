export function isCanonicalWorkspaceMediaPersistSource(input: { storageKey?: string; pendingRemoteUpload?: boolean }) {
    return Boolean(input.storageKey?.trim()) && !input.pendingRemoteUpload;
}
