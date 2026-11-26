import { Drawer, Empty } from "antd";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CanvasProject } from "@canvas/stores/canvas/use-canvas-store";

export function CanvasVersionHistoryDrawer({
    open,
    onClose,
}: {
    open: boolean;
    projectId: string;
    onClose: () => void;
    onRestored: (project: CanvasProject) => void;
}) {
    const { t } = useTranslation();

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
            <Empty description={t("canvas.versions.empty")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Drawer>
    );
}