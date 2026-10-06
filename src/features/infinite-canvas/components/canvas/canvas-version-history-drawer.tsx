import { useCallback, useEffect, useState } from "react";
import { App, Button, Drawer, Empty, Popconfirm, Spin } from "antd";
import { History, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MiniMapPreview } from "@canvas/components/canvas/canvas-mini-map";
import {
    getUserCanvasProjectVersion,
    listUserCanvasProjectVersions,
    restoreUserCanvasProjectVersion,
    type UserCanvasProjectVersionSummary,
} from "@canvas/services/api/user-canvas-projects";
import { applyRestoredCanvasProject } from "@canvas/services/user-canvas-project-sync";
import type { CanvasProject } from "@canvas/stores/canvas/use-canvas-store";
import type { CanvasNodeData } from "@canvas/types/canvas";

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatVersionTime(unixSeconds: number, locale: string) {
    if (!unixSeconds) return "—";
    try {
        return new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).format(new Date(unixSeconds * 1000));
    } catch {
        return new Date(unixSeconds * 1000).toLocaleString();
    }
}

export function CanvasVersionHistoryDrawer({
    open,
    projectId,
    onClose,
    onRestored,
}: {
    open: boolean;
    projectId: string;
    onClose: () => void;
    onRestored: (project: CanvasProject) => void;
}) {
    const { t, i18n } = useTranslation();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [versions, setVersions] = useState<UserCanvasProjectVersionSummary[]>([]);
    const [previewById, setPreviewById] = useState<Record<number, CanvasNodeData[] | "loading" | "error">>({});

    const loadVersions = useCallback(async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const items = await listUserCanvasProjectVersions(projectId);
            setVersions(items);
            setPreviewById({});
            items.slice(0, 8).forEach((item) => {
                void loadPreview(item.id);
            });
        } catch (error) {
            setVersions([]);
            message.error(error instanceof Error ? error.message : t("canvas.versions.loadFailed"));
        } finally {
            setLoading(false);
        }

        async function loadPreview(versionId: number) {
            setPreviewById((prev) => (prev[versionId] ? prev : { ...prev, [versionId]: "loading" }));
            try {
                const dto = await getUserCanvasProjectVersion(projectId, versionId);
                const nodes = Array.isArray(dto.project?.nodes) ? dto.project.nodes : [];
                setPreviewById((prev) => ({ ...prev, [versionId]: nodes }));
            } catch {
                setPreviewById((prev) => ({ ...prev, [versionId]: "error" }));
            }
        }
    }, [message, projectId, t]);

    useEffect(() => {
        if (!open) return;
        void loadVersions();
    }, [loadVersions, open]);

    const ensurePreview = async (versionId: number) => {
        if (previewById[versionId] && previewById[versionId] !== "error") return;
        setPreviewById((prev) => ({ ...prev, [versionId]: "loading" }));
        try {
            const dto = await getUserCanvasProjectVersion(projectId, versionId);
            const nodes = Array.isArray(dto.project?.nodes) ? dto.project.nodes : [];
            setPreviewById((prev) => ({ ...prev, [versionId]: nodes }));
        } catch {
            setPreviewById((prev) => ({ ...prev, [versionId]: "error" }));
            message.error(t("canvas.versions.previewFailed"));
        }
    };

    const handleRestore = async (version: UserCanvasProjectVersionSummary) => {
        setRestoringId(version.id);
        try {
            const dto = await restoreUserCanvasProjectVersion(projectId, version.id);
            const applied = applyRestoredCanvasProject(projectId, dto.project, dto.title || version.title);
            if (!applied) {
                throw new Error(t("canvas.versions.restoreFailed"));
            }
            message.success(t("canvas.versions.restored"));
            onRestored(applied);
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvas.versions.restoreFailed"));
        } finally {
            setRestoringId(null);
        }
    };

    return (
        <Drawer
            title={
                <div className="flex items-center gap-2">
                    <History className="size-4" />
                    <span>{t("canvas.versions.title")}</span>
                </div>
            }
            open={open}
            onClose={onClose}
            placement="right"
            size={460}
            destroyOnClose
        >
            <div className="mb-3 text-xs leading-relaxed text-stone-500">{t("canvas.versions.description")}</div>
            {loading ? (
                <div className="flex justify-center py-16">
                    <Spin />
                </div>
            ) : versions.length === 0 ? (
                <Empty description={t("canvas.versions.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <div className="space-y-3">
                    {versions.map((version, index) => {
                        const preview = previewById[version.id];
                        return (
                            <div
                                key={version.id}
                                className="rounded-xl border border-stone-200 p-3 dark:border-stone-800"
                                onMouseEnter={() => void ensurePreview(version.id)}
                            >
                                <div className="mb-2 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
                                    {Array.isArray(preview) ? (
                                        <MiniMapPreview nodes={preview} width={412} height={132} />
                                    ) : (
                                        <div className="flex h-[132px] items-center justify-center text-xs text-stone-400">
                                            {preview === "error" ? t("canvas.versions.previewFailed") : t("canvas.versions.loadingPreview")}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                            {version.title || t("canvas.project.untitled")}
                                            {index === 0 ? (
                                                <span className="ml-2 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-normal text-stone-500 dark:bg-stone-800">
                                                    {t("canvas.versions.latest")}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="mt-1 text-xs text-stone-500">
                                            {formatVersionTime(version.created_at, i18n.language)}
                                        </div>
                                        <div className="mt-0.5 text-xs text-stone-400">
                                            {t("canvas.versions.size", { size: formatBytes(version.project_size) })}
                                        </div>
                                    </div>
                                    <Popconfirm
                                        title={t("canvas.versions.restoreTitle")}
                                        description={t("canvas.versions.restoreDescription")}
                                        okText={t("canvas.versions.restore")}
                                        cancelText={t("canvas.editors.cancel")}
                                        onConfirm={() => void handleRestore(version)}
                                    >
                                        <Button
                                            size="small"
                                            icon={<RotateCcw className="size-3.5" />}
                                            loading={restoringId === version.id}
                                        >
                                            {t("canvas.versions.restore")}
                                        </Button>
                                    </Popconfirm>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Drawer>
    );
}
