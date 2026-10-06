import type { ReactNode } from "react";
import { Compass, Focus, HelpCircle, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    onFit: () => void;
    onArrange: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
};

const ZOOM_PRESETS = [0.5, 1, 8];

function shortcutMod() {
    if (typeof navigator === "undefined") return "Ctrl";
    return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}

export function CanvasZoomControls({ scale, onScaleChange, onReset, onFit, onArrange, isMiniMapOpen, onToggleMiniMap }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [zoomOpen, setZoomOpen] = useState(false);
    const zoomRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(15,23,42,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };
    const percent = Math.round(scale * 100);
    const mod = shortcutMod();

    useEffect(() => {
        if (!zoomOpen) return;
        const close = (event: PointerEvent) => {
            if (!zoomRef.current?.contains(event.target as Node)) setZoomOpen(false);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [zoomOpen]);

    const panelStyle = {
        background: colorTheme === "dark" ? "#2c2c2e" : theme.toolbar.panel,
        borderColor: theme.toolbar.border,
        color: theme.toolbar.item,
        boxShadow: colorTheme === "dark" ? "0 18px 40px rgba(0,0,0,.45)" : "0 16px 36px rgba(15,23,42,.16)",
    };

    return (
        <div className="absolute bottom-5 left-5 z-50" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex h-14 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={dockStyle}>
                <Tooltip title={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}>
                    <Button
                        type="text"
                        className="!h-8 !w-8 !min-w-8 !p-0"
                        style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                        icon={<Compass className="size-4" />}
                        onClick={onToggleMiniMap}
                        aria-label={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}
                    />
                </Tooltip>
                <Tooltip title={t("canvas.resetView")}>
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label={t("canvas.resetView")} />
                </Tooltip>
                <Tooltip title={t("canvas.arrangeNodes")}>
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<LayoutGrid className="size-4" />} onClick={onArrange} aria-label={t("canvas.arrangeNodes")} />
                </Tooltip>
                <div ref={zoomRef} className="relative flex items-center">
                    <button
                        type="button"
                        className="min-w-10 rounded-md px-1 py-1 text-right text-xs tabular-nums transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: theme.node.muted }}
                        onClick={() => setZoomOpen((open) => !open)}
                        aria-expanded={zoomOpen}
                        aria-label={t("canvas.zoom")}
                        title={t("canvas.zoom")}
                    >
                        {percent}%
                    </button>
                    {zoomOpen ? (
                        <div className="absolute bottom-[calc(100%+10px)] left-0 z-[60] w-64 overflow-hidden rounded-xl border py-2 shadow-2xl" style={panelStyle}>
                            <div className="flex items-center gap-3 px-3 pb-2">
                                <input
                                    type="range"
                                    min="5"
                                    max="800"
                                    step="1"
                                    value={percent}
                                    className="min-w-0 flex-1"
                                    style={{ accentColor: theme.node.activeStroke }}
                                    onChange={(event) => onScaleChange(Number(event.target.value) / 100)}
                                    aria-label={t("canvas.zoom")}
                                />
                                <span className="w-8 shrink-0 text-right text-sm tabular-nums opacity-70">%</span>
                            </div>
                            <ZoomMenuItem label={t("canvas.zoomIn")} shortcut={`${mod} +`} onClick={() => { onScaleChange(Math.min(8, scale * 1.25)); setZoomOpen(false); }} />
                            <ZoomMenuItem label={t("canvas.zoomOut")} shortcut={`${mod} -`} onClick={() => { onScaleChange(Math.max(0.05, scale / 1.25)); setZoomOpen(false); }} />
                            <ZoomMenuItem label={t("canvas.fitToScreen")} shortcut={`${mod} 0`} onClick={() => { onFit(); setZoomOpen(false); }} />
                            <div className="my-1 h-px bg-white/10" />
                            {ZOOM_PRESETS.map((preset) => (
                                <ZoomMenuItem
                                    key={preset}
                                    label={t("canvas.zoomTo", { percent: Math.round(preset * 100) })}
                                    onClick={() => { onScaleChange(preset); setZoomOpen(false); }}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
                <Tooltip title={t("canvas.shortcuts")}>
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={shortcutsOpen ? activeStyle : { color: theme.toolbar.item }} icon={<HelpCircle className="size-4" />} onClick={() => setShortcutsOpen(true)} aria-label={t("canvas.shortcuts")} />
                </Tooltip>
            </div>
            <Drawer
                title={t("canvas.shortcuts")}
                open={shortcutsOpen}
                onClose={() => setShortcutsOpen(false)}
                placement="right"
                size={380}
                destroyOnClose
            >
                <div className="space-y-3 text-sm">
                    <Shortcut label={`Ctrl / Space + ${t("canvas.shortcut.drag")}`} value={t("canvas.shortcut.toggleTool")} />
                    <Shortcut label={t("canvas.shortcut.wheel")} value={t("canvas.shortcut.zoom")} />
                    <Shortcut label={t("canvas.shortcut.drag")} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut label={`Shift / Cmd + ${t("canvas.shortcut.click")}`} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut label="Ctrl / Cmd + C / V" value={t("canvas.shortcut.copyPasteNodes")} />
                    <Shortcut label="Delete / Backspace" value={t("canvas.shortcut.delete")} />
                </div>
            </Drawer>
        </div>
    );
}

function ZoomMenuItem({ label, shortcut, onClick }: { label: string; shortcut?: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/10"
            onClick={onClick}
        >
            <span>{label}</span>
            {shortcut ? <span className="text-xs opacity-45">{shortcut}</span> : null}
        </button>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
