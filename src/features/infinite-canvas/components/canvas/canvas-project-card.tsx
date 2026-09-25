import { Check, CloudUpload, Download, Pencil, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input } from "antd";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { toIntlLocale } from "@/i18n/languages";

import { CanvasProjectPreview } from "@canvas/components/canvas/canvas-project-preview";
import { cn } from "@canvas/lib/utils";
import { useCanvasStore, type CanvasProject } from "@canvas/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@canvas/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@canvas/lib/canvas/canvas-export";
import { getCanvasProjectSaveStatus, saveCanvasProjectNow, subscribeCanvasProjectSaveStatus } from "@canvas/services/user-canvas-project-sync";

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => navigate(`/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`);
    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };
    const saveStatus = useSyncExternalStore(subscribeCanvasProjectSaveStatus, () => getCanvasProjectSaveStatus(project.id));
    const [syncing, setSyncing] = useState(false);
    const syncToCloud = () => {
        if (syncing) return;
        setSyncing(true);
        void saveCanvasProjectNow(project.id).finally(() => setSyncing(false));
    };
    const formatDate = (value: string) =>
        new Date(value).toLocaleString(toIntlLocale(i18n.resolvedLanguage), {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <article
            className={cn(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white/55 shadow-sm backdrop-blur-sm transition duration-300 ease-out",
                "hover:-translate-y-0.5 hover:shadow-md dark:bg-stone-900/55",
                selected
                    ? "border-stone-900/40 ring-1 ring-stone-900/15 dark:border-stone-100/40 dark:ring-stone-100/15"
                    : "border-stone-200/80 dark:border-stone-800",
            )}
            onClick={() => !editing && open()}
        >
            <div className="relative p-2 pb-0">
                <CanvasProjectPreview project={project} />
                <label
                    className={cn(
                        "absolute left-3.5 top-3.5 z-10 inline-flex size-6 items-center justify-center rounded-full border bg-white/90 shadow-sm transition dark:bg-stone-950/90",
                        selected || "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                        selected
                            ? "border-stone-900 text-stone-950 dark:border-stone-100 dark:text-stone-50"
                            : "border-stone-300 text-stone-500 dark:border-stone-600",
                    )}
                    onClick={(event) => event.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => toggleSelected(project.id, event.target.checked)}
                        className="size-3 accent-stone-950 dark:accent-stone-100"
                        aria-label={t("canvas.project.select", { name: project.title })}
                    />
                </label>
            </div>

            <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
                <div className="min-w-0">
                    {editing ? (
                        <Input
                            size="small"
                            className="min-w-0"
                            value={editingTitle}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onKeyDown={(event) => event.key === "Enter" && saveTitle()}
                            autoFocus
                        />
                    ) : (
                        <button
                            type="button"
                            className="min-w-0 cursor-pointer text-left"
                            onClick={(event) => {
                                event.stopPropagation();
                                open();
                            }}
                        >
                            <h2 className="truncate text-sm font-semibold tracking-tight text-stone-950 dark:text-stone-50">{project.title}</h2>
                            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                                {t("canvas.project.stats", { nodes: project.nodes.length, connections: project.connections.length })}
                            </p>
                        </button>
                    )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="truncate text-[11px] text-stone-500">
                            {t("canvas.project.updated", { date: formatDate(project.updatedAt) })}
                        </p>
                        <p className={cn("mt-0.5 truncate text-[11px]", saveStatus.dirty ? "text-amber-600 dark:text-amber-400" : "text-stone-400 dark:text-stone-500")}>
                            {saveStatus.dirty
                                ? t("canvas.project.unsyncedChanges")
                                : project.cloudSyncedAt
                                  ? t("canvas.project.synced", { date: formatDate(project.cloudSyncedAt) })
                                  : t("canvas.project.notSynced")}
                        </p>
                    </div>
                    <div
                        className={cn(
                            "flex shrink-0 items-center gap-0 transition",
                            editing ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                        )}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {editing ? (
                            <>
                                <Button type="text" size="small" shape="circle" icon={<Check className="size-3.5" />} onClick={saveTitle} aria-label={t("canvas.project.saveName")} />
                                <Button type="text" size="small" shape="circle" icon={<X className="size-3.5" />} onClick={stopEditing} aria-label={t("canvas.project.cancelRename")} />
                            </>
                        ) : (
                            <>
                                <Button type="text" size="small" shape="circle" loading={syncing || saveStatus.saving} icon={<CloudUpload className="size-3.5" />} onClick={syncToCloud} aria-label={t("canvas.project.sync")} />
                                <Button type="text" size="small" shape="circle" icon={<Download className="size-3.5" />} onClick={() => void exportCanvasProjects([project], project.title || t("canvas.title"))} aria-label={t("canvas.project.export")} />
                                <Button type="text" size="small" shape="circle" icon={<Pencil className="size-3.5" />} onClick={() => startEditing(project.id, project.title)} aria-label={t("canvas.project.rename")} />
                                <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleteIds([project.id])} aria-label={t("canvas.project.delete")} />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
