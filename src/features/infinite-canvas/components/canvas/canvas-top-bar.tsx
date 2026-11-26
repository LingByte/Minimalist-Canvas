import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, CloudUpload, Download, FolderOpen, History, Home, Images, Layers3, Plus, Redo2, Trash2, Undo2, Upload } from "lucide-react";
import { Button, Dropdown, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { CanvasVersionHistoryDrawer } from "@canvas/components/canvas/canvas-version-history-drawer";
import { UserStatusActions } from "@canvas/components/layout/user-status-actions";
import { useCanvasHost } from "@canvas/integration/canvas-host-context";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { cn } from "@canvas/lib/utils";
import { useCanvasStore, type CanvasProject } from "@canvas/stores/canvas/use-canvas-store";
import { useCanvasSidePanelStore } from "@canvas/stores/use-canvas-side-panel-store";
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
    const navigate = useNavigate();
    const { logo, brandName } = useCanvasHost();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const [versionsOpen, setVersionsOpen] = useState(false);
    const projects = useCanvasStore((state) => state.projects);
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);
    const saveLabel = saveSaving ? t("canvas.cloudVersion.uploading") : saveDirty ? t("canvas.cloudVersion.upload") : t("canvas.cloudVersion.uploaded");
    const saveHint = saveDirty ? t("canvas.cloudVersion.hintDirty") : t("canvas.cloudVersion.hint");
    const chipStyle = {
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
        color: theme.node.text,
        boxShadow: colorTheme === "dark" ? "0 12px 32px rgba(0,0,0,.35)" : "0 10px 28px rgba(15,23,42,.10)",
    };
    const activeBtn = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    const canvasLabel = useMemo(() => {
        const index = Math.max(0, projects.findIndex((item) => item.id === projectId));
        return t("canvas.topBar.canvasN", { n: index + 1 });
    }, [projectId, projects, t]);

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
            <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-2 px-3 pt-3 md:px-4">
                <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                    <div className="flex h-11 min-w-0 items-center gap-1 rounded-lg border px-1 shadow-lg backdrop-blur" style={chipStyle}>
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "home", icon: <Home className="size-4" />, label: t("canvas.home"), onClick: onHome },
                                    { key: "projects", icon: <Images className="size-4" />, label: t("canvas.projects"), onClick: onProjects || onHome },
                                    { type: "divider" },
                                    { key: "new", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                    { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.deleteCurrent"), onClick: onDeleteProject },
                                    { type: "divider" },
                                    {
                                        key: "save",
                                        icon: <CloudUpload className="size-4" />,
                                        label: <MenuLabel text={t("canvas.cloudVersion.upload")} shortcut="⌘ S" />,
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
                                    ...(onOpenFolder
                                        ? [{ key: "folder" as const, icon: <FolderOpen className="size-4" />, label: t("canvas.openFolder"), onClick: onOpenFolder }]
                                        : []),
                                    { type: "divider" },
                                    { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvas.undo")} shortcut="⌘ Z" />, onClick: onUndo },
                                    { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvas.redo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                                ],
                            }}
                        >
                            <button
                                type="button"
                                className="flex h-9 shrink-0 items-center gap-1 rounded-md px-1.5 transition hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label={t("canvas.openMenu")}
                            >
                                {logo ? (
                                    <img src={logo} alt="" className="size-7 rounded-md object-contain" />
                                ) : (
                                    <span className="grid size-7 place-items-center rounded-md bg-black/5 text-xs font-bold dark:bg-white/10">
                                        {(brandName || "C").slice(0, 1)}
                                    </span>
                                )}
                                <span className="hidden max-w-[88px] truncate text-sm font-medium sm:inline">{brandName}</span>
                                <ChevronDown className="size-3.5 opacity-55" />
                            </button>
                        </Dropdown>

                        <div ref={titleRef} className="min-w-0 max-w-[140px] md:max-w-[220px]">
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
                                    className="w-full bg-transparent px-1 text-sm font-medium outline-none"
                                    style={{ color: theme.node.text }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    className="block w-full truncate px-1 text-left text-sm font-medium"
                                    onDoubleClick={onStartTitleEditing}
                                    title={t("canvas.renameHint")}
                                >
                                    {title}
                                </button>
                            )}
                        </div>

                        <span className="mx-0.5 h-4 w-px shrink-0 opacity-25" style={{ background: theme.node.text }} />

                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    ...projects.map((project, index) => ({
                                        key: project.id,
                                        label: (
                                            <span className="flex min-w-40 items-center justify-between gap-3">
                                                <span className="truncate">{project.title || t("canvas.topBar.canvasN", { n: index + 1 })}</span>
                                                {project.id === projectId ? <Check className="size-3.5 opacity-70" /> : null}
                                            </span>
                                        ),
                                        onClick: () => {
                                            if (project.id !== projectId) navigate(`/canvas/${project.id}`);
                                        },
                                    })),
                                    { type: "divider" as const },
                                    { key: "create", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                ],
                            }}
                        >
                            <button
                                type="button"
                                className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label={t("canvas.topBar.switchCanvas")}
                            >
                                <span className="max-w-[88px] truncate md:max-w-[120px]">{canvasLabel}</span>
                                <ChevronDown className="size-3.5 opacity-55" />
                            </button>
                        </Dropdown>
                    </div>

                    <div className="flex h-11 items-center gap-0.5 rounded-lg border px-1 shadow-lg backdrop-blur" style={chipStyle}>
                        <Tooltip title={t("canvas.sidePanel.elements")}>
                            <button
                                type="button"
                                onClick={toggleSidePanel}
                                className={cn("grid size-9 place-items-center rounded-md transition", !sidePanelOpen && "hover:bg-black/5 dark:hover:bg-white/10")}
                                style={sidePanelOpen ? activeBtn : undefined}
                                aria-label={t("canvas.sidePanel.elements")}
                                aria-pressed={sidePanelOpen}
                                data-tour="canvas-elements-button"
                            >
                                <Layers3 className="size-4" />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                    <Tooltip title={saveHint}>
                        <Button
                            type="text"
                            loading={saveSaving}
                            onClick={onSaveProject}
                            className="!flex !h-10 !items-center !gap-1.5 !rounded-xl !px-2.5"
                            style={{
                                background: saveDirty ? theme.toolbar.activeBg : theme.toolbar.panel,
                                color: theme.node.text,
                                border: `1px solid ${theme.toolbar.border}`,
                                boxShadow: chipStyle.boxShadow,
                            }}
                            icon={!saveSaving ? <CloudUpload className="size-4" /> : undefined}
                            aria-label={saveLabel}
                        >
                            <span className="hidden text-xs font-medium sm:inline">{saveLabel}</span>
                            {saveDirty && !saveSaving ? <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" /> : null}
                        </Button>
                    </Tooltip>
                    <div className="flex h-10 items-center gap-0.5 rounded-xl border px-1 shadow-lg backdrop-blur" style={chipStyle}>
                        <Tooltip title={t("canvas.versions.title")}>
                            <button
                                type="button"
                                className="grid size-8 place-items-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/10"
                                onClick={() => setVersionsOpen(true)}
                                aria-label={t("canvas.versions.title")}
                            >
                                <History className="size-4" />
                            </button>
                        </Tooltip>
                        <UserStatusActions variant="canvas" compactOnMobile />
                        <Button
                            type="text"
                            className="!flex !h-8 !w-8 !min-w-8 !items-center !justify-center !rounded-lg !p-0 md:!w-auto md:!min-w-0 md:!px-2.5"
                            style={agentOpen ? activeBtn : { color: theme.node.text }}
                            icon={<Bot className="size-4" />}
                            onClick={onToggleAgent}
                            aria-label={t(agentOpen ? "topNav.closeAgent" : "topNav.openAgent")}
                        >
                            <span className="hidden md:inline">{t("agent.panel.brandName")}</span>
                        </Button>
                    </div>
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
