import { Button, Input, InputNumber, Select } from "antd";
import { Clapperboard, Image as ImageIcon, Plus, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { createStoryboardRow, normalizeStoryboard } from "@canvas/lib/canvas/canvas-storyboard";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import type { CanvasNodeData, StoryboardRow } from "@canvas/types/canvas";

export function CanvasScriptNodeContent({
    node,
    onChange,
    onGenerateImages,
    onGenerateVideos,
    busy,
}: {
    node: CanvasNodeData;
    onChange: (rows: StoryboardRow[]) => void;
    onGenerateImages: () => void;
    onGenerateVideos: (mode: "keyframe" | "direct") => void;
    busy?: boolean;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const storyboard = normalizeStoryboard(node.metadata?.storyboard);
    const rows = storyboard.rows;
    const [videoMode, setVideoMode] = useState<"keyframe" | "direct">("keyframe");

    const patchRow = (rowId: string, patch: Partial<StoryboardRow>) => {
        onChange(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    };

    return (
        <div
            className="flex h-full min-h-0 w-full cursor-default flex-col p-3 text-xs"
            style={{ color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="mb-2 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg" style={{ background: theme.toolbar.activeBg, color: theme.node.muted }}>
                    <Clapperboard className="size-3.5" />
                </span>
                <span className="text-sm font-semibold">{t("canvas.storyboard.title")}</span>
                <span className="ml-auto opacity-60">{t("canvas.storyboard.rowCount", { count: rows.length })}</span>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {rows.map((row) => (
                    <div key={row.id} className="rounded-xl border p-2" style={{ borderColor: theme.node.stroke, background: `${theme.node.fill}88` }}>
                        <div className="mb-1.5 flex items-center gap-2">
                            <span className="w-8 shrink-0 font-semibold tabular-nums">#{row.shotNumber}</span>
                            <InputNumber
                                size="small"
                                min={1}
                                max={30}
                                value={row.durationSeconds}
                                onChange={(value) => patchRow(row.id, { durationSeconds: Number(value) || 5 })}
                                addonAfter="s"
                                className="!w-[108px]"
                            />
                            {row.imageNodeId ? <ImageIcon className="size-3.5 opacity-70" /> : null}
                            {row.videoNodeId ? <Video className="size-3.5 opacity-70" /> : null}
                            <button
                                type="button"
                                className="ml-auto grid size-6 place-items-center rounded-md opacity-60 hover:opacity-100"
                                onClick={() => onChange(rows.filter((item) => item.id !== row.id).map((item, index) => ({ ...item, shotNumber: index + 1 })))}
                                aria-label={t("canvas.storyboard.removeRow")}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                        <Input.TextArea
                            size="small"
                            autoSize={{ minRows: 2, maxRows: 4 }}
                            value={row.plotDescription}
                            placeholder={t("canvas.storyboard.plotPlaceholder")}
                            onChange={(event) => patchRow(row.id, { plotDescription: event.target.value })}
                        />
                    </div>
                ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => onChange([...rows, createStoryboardRow(rows.length + 1)])}>
                    {t("canvas.storyboard.addRow")}
                </Button>
                <Button size="small" disabled={busy} onClick={onGenerateImages}>
                    {t("canvas.storyboard.generateImages")}
                </Button>
                <Select
                    size="small"
                    className="!min-w-[132px]"
                    value={videoMode}
                    onChange={(value) => setVideoMode(value)}
                    options={[
                        { value: "keyframe", label: t("canvas.storyboard.keyframeMode") },
                        { value: "direct", label: t("canvas.storyboard.directMode") },
                    ]}
                />
                <Button size="small" disabled={busy} onClick={() => onGenerateVideos(videoMode)}>
                    {t("canvas.storyboard.generateVideos")}
                </Button>
            </div>
        </div>
    );
}
