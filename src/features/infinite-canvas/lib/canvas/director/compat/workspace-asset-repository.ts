export class WorkspaceAssetMediaPendingError extends Error {
    constructor() {
        super("素材仍在上传");
        this.name = "WorkspaceAssetMediaPendingError";
    }
}

export async function persistWorkspaceAssetLink(_input: unknown) {}
