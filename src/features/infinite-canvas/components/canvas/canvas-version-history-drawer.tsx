import { useCallback, useEffect, useState } from "react";
import { App, Button, Drawer, Empty, Modal, Spin } from "antd";
import { History, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toIntlLocale } from "@/i18n/languages";

import {
    CANVAS_CLOUD_VERSION_LIMIT,
    listCanvasCloudVersions,
    prepareCanvasCloudVersionRestore,
    type CanvasCloudVersionMeta,
} from "@canvas/services/canvas-cloud-versions";
import { isObjectStorageConfigured, useConfigStore } from "@canvas/stores/use-config-store";
import type { CanvasProject } from "@canvas/stores/canvas/use-canvas-store";

function formatBytes(bytes: number) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();
    const objectStorage = useConfigStore((state) => state.objectStorage);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const configured = isObjectStorageConfigured(objectStorage);
    const [loading, setLoading] = useState(false);
    const [versions, setVersions] = useState<CanvasCloudVersionMeta[]>([]);
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!configured) {
            setVersions([]);
            return;
        }
        setLoading(true);
        try {
            setVersions(await listCanvasCloudVersions(projectId));
        } catch (error) {
            console.error(error);
            message.error(error instanceof Error ? error.message : t("canvas.versions.loadFailed"));
            setVersions([]);
        } finally {
            setLoading(false);
        }
    }, [configured, message, projectId, t]);

    useEffect(() => {
        if (!open) return;
        void refresh();
    }, [open, refresh]);

    const restoreVersion = (version: CanvasCloudVersionMeta) => {
        Modal.confirm({
            title: t("canvas.versions.restoreTitle"),
            content: t("canvas.versions.restoreDescription"),
            okText: t("canvas.versions.restore"),
            cancelText: t("common.cancel"),
            onOk: async () => {
                setRestoringId(version.id);
                try {
                    const project = await prepareCanvasCloudVersionRestore(projectId, version.id);
                    await onRestored(project);
                    message.success(t("canvas.versions.restored"));
                    onClose();
                } catch (error) {
                    console.error(error);
                    message.error(error instanceof Error ? error.message : t("canvas.versions.restoreFailed"));
                    throw error;
                } finally {
                    setRestoringId(null);
                }
            },
        });
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
            <div className="mb-3 text-xs leading-relaxed text-stone-500">
                {t("canvas.versions.description", { count: CANVAS_CLOUD_VERSION_LIMIT })}
            </div>

            {!configured ? (
                <Empty
                    description={t("canvas.cloudVersion.configureFirst")}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => openConfigDialog(false, "object-storage")}>
                        {t("canvas.cloudVersion.openSettings")}
                    </Button>
                </Empty>
            ) : loading ? (
                <div className="flex min-h-48 items-center justify-center">
                    <Spin />
                </div>
            ) : !versions.length ? (
                <Empty description={t("canvas.versions.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                <div className="space-y-2">
                    {versions.map((version, index) => (
                        <div
                            key={version.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5 dark:border-stone-800"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{version.title || t("workbench.untitled")}</div>
                                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-stone-500">
                                    <span>
                                        {new Date(version.createdAt).toLocaleString(toIntlLocale(i18n.resolvedLanguage), {
                                            hour12: false,
                                        })}
                                    </span>
                                    <span>{t("canvas.versions.size", { size: formatBytes(version.bytes) })}</span>
                                    {index === 0 ? <span>{t("canvas.versions.latest")}</span> : null}
                                </div>
                            </div>
                            <Button
                                size="small"
                                icon={<RotateCcw className="size-3.5" />}
                                loading={restoringId === version.id}
                                disabled={Boolean(restoringId)}
                                onClick={() => restoreVersion(version)}
                            >
                                {t("canvas.versions.restore")}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
}
