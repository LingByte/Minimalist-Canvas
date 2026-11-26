import { useEffect, useRef, useState } from "react";
import { Bot, Download, FolderOpen, History, Home, Images, Menu, Plus, Redo2, Save, Trash2, Undo2, Upload } from "lucide-react";
import { Button, Dropdown, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { CanvasVersionHistoryDrawer } from "@canvas/components/canvas/canvas-version-history-drawer";
import { UserStatusActions } from "@canvas/components/layout/user-status-actions";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import type { CanvasProject } from "@canvas/stores/canvas/use-canvas-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

export function CanvasTopBar({
    projectId,
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    saveDirty,
    saveSaving,
    onSaveProject,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onExportProject,
    onOpenFolder,
    onImportImage,
    onUndo,
    onRedo,
    onVersionRestored,
    agentOpen,
    onToggleAgent,
}: {
    projectId: string;
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    saveDirty: boolean;
    saveSaving: boolean;
    onSaveProject: () => void;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onExportProject: () => void;
    onOpenFolder?: () => void;
    onImportImage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onVersionRestored: (project: CanvasProject) => void;
    agentOpen: boolean;
    onToggleAgent: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [versionsOpen, setVersionsOpen] = useState(false);
    const saveLabel = saveSaving ? t("canvas.saving") : saveDirty ? t("canvas.saveNow") : t("canvas.saved");
    const saveHint = saveDirty ? t("canvas.saveHintDirty") : t("canvas.saveHint");

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex h-12 items-center gap-2 overflow-hidden px-1 md:h-16 md:px-3 md:pr-4">
                <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1 overflow-hidden md:gap-2">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "home", icon: <Home className="size-4" />, label: t("canvas.home"), onClick: onHome },
                                { key: "projects", icon: <Images className="size-4" />, label: t("canvas.projects"), onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.deleteCurrent"), onClick: onDeleteProject },
                                { type: "divider" },
                                {
                                    key: "save",
                                    icon: <Save className="size-4" />,
                                    label: <MenuLabel text={t("canvas.saveNow")} shortcut="⌘ S" />,
                                    disabled: saveSaving,
                                    onClick: onSaveProject,
                                },
                                {
                                    key: "versions",
                                    icon: <History className="size-4" />,
                                    label: t("canvas.versions.title"),
                                    onClick: () => setVersionsOpen(true),
                                },
                                { key: "import", icon: <Upload className="size-4" />, label: t("canvas.importAsset"), onClick: onImportImage },
                                { key: "export", icon: <Download className="size-4" />, label: t("canvas.exportCurrent"), onClick: onExportProject },
                                ...(onOpenFolder ? [{ key: "folder" as const, icon: <FolderOpen className="size-4" />, label: t("canvas.openFolder"), onClick: onOpenFolder }] : []),
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvas.undo")} shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvas.redo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label={t("canvas.openMenu")}>
                            <Menu className="size-4" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="min-w-0 flex-1 overflow-hidden">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="w-full max-w-full bg-transparent p-0 text-left text-sm font-semibold tracking-normal outline-none md:max-w-[280px] md:text-lg"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="block w-full max-w-full truncate border-b border-dashed border-transparent text-left text-sm font-semibold tracking-normal transition hover:border-current md:max-w-[280px] md:text-lg"
                                onDoubleClick={onStartTitleEditing}
                                title={t("canvas.renameHint")}
                            >
                                {title}
                            </button>
                        )}
                    </div>
                    <Tooltip title={saveHint}>
                        <Button
                            type="text"
                            loading={saveSaving}
                            onClick={onSaveProject}
                            className="!flex !h-8 !items-center !gap-1.5 !rounded-xl !px-2.5 md:!h-9"
                            style={{
                                background: saveDirty ? theme.toolbar.activeBg : theme.toolbar.panel,
                                color: theme.node.text,
                                boxShadow: "0 10px 30px rgba(15,23,42,.08)",
                            }}
                            icon={!saveSaving ? <Save className="size-4" /> : undefined}
                            aria-label={saveLabel}
                        >
                            <span className="hidden text-xs font-medium sm:inline">{saveLabel}</span>
                            {saveDirty && !saveSaving ? <span className="size-1.5 rounded-full bg-amber-500 sm:ml-0.5" aria-hidden="true" /> : null}
                        </Button>
                    </Tooltip>
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 md:gap-1.5">
                    <Tooltip title={t("canvas.versions.title")}>
                        <button
                            type="button"
                            className="grid size-8 shrink-0 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text }}
                            onClick={() => setVersionsOpen(true)}
                            aria-label={t("canvas.versions.title")}
                        >
                            <History className="size-4" />
                        </button>
                    </Tooltip>
                    <UserStatusActions
                        variant="canvas"
                        compactOnMobile
                    />
                    <span className="mx-0.5 hidden h-6 w-px md:block" style={{ background: theme.toolbar.border }} />
                    <Button
                        type="text"
                        className="!flex !h-8 !w-8 !min-w-8 !items-center !justify-center !rounded-xl !p-0 md:!h-10 md:!w-auto md:!min-w-0 md:!px-3"
                        style={{ background: agentOpen ? theme.toolbar.activeBg : theme.toolbar.panel, color: theme.node.text, boxShadow: "0 10px 30px rgba(15,23,42,.10)" }}
                        icon={<Bot className="size-4" />}
                        onClick={onToggleAgent}
                        aria-label={t(agentOpen ? "topNav.closeAgent" : "topNav.openAgent")}
                    >
                        <span className="hidden md:inline">Agent</span>
                    </Button>
                </div>
            </div>
            <CanvasVersionHistoryDrawer
                open={versionsOpen}
                projectId={projectId}
                onClose={() => setVersionsOpen(false)}
                onRestored={onVersionRestored}
            />
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}
