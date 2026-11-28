import { Check, Download, FolderOpen, Pencil, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Input } from "antd";
import { useTranslation } from "react-i18next";

import { toIntlLocale } from "@/i18n/languages";

import { CanvasProjectPreview } from "@canvas/components/canvas/canvas-project-preview";
import { cn } from "@canvas/lib/utils";
import { exportCanvasProjects } from "@canvas/lib/canvas/canvas-export";
import { isTauri, openCanvasWorkspaceFolder } from "@canvas/services/fs-store";
import { useCanvasStore, type CanvasProject } from "@canvas/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@canvas/stores/canvas/use-canvas-ui-store";

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const { message } = App.useApp();
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

    return (
        <article
            className={cn(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card transition duration-200",
                "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)]",
                selected ? "border-primary ring-1 ring-primary/20" : "border-border/80",
            )}
            onClick={() => !editing && open()}
        >
            <div className="relative p-2.5 pb-0">
                <CanvasProjectPreview project={project} />
                <label
                    className={cn(
                        "absolute left-4 top-4 z-10 inline-flex size-6 items-center justify-center rounded-md border bg-white/90 shadow-sm transition dark:bg-stone-950/90",
                        selected || "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                        selected
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground",
                    )}
                    onClick={(event) => event.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => toggleSelected(project.id, event.target.checked)}
                        className="accent-primary size-3.5"
                        aria-label={t("canvas.project.select", { name: project.title })}
                    />
                </label>
            </div>

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="min-w-0">
                    {editing ? (
                        <Input
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
                            className="min-w-0 w-full cursor-pointer text-left"
                            onClick={(event) => {
                                event.stopPropagation();
                                open();
                            }}
                        >
                            <h2 className="text-foreground truncate text-[15px] font-semibold tracking-tight">{project.title}</h2>
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t("canvas.project.stats", { nodes: project.nodes.length, connections: project.connections.length })}
                            </p>
                        </button>
                    )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-[11px] tabular-nums">
                        {t("canvas.project.updated", {
                            date: new Date(project.updatedAt).toLocaleString(toIntlLocale(i18n.resolvedLanguage), {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                            }),
                        })}
                    </p>
                    <div
                        className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {editing ? (
                            <>
                                <Button type="text" size="small" shape="circle" icon={<Check className="size-3.5" />} onClick={saveTitle} aria-label={t("canvas.project.saveName")} />
                                <Button type="text" size="small" shape="circle" icon={<X className="size-3.5" />} onClick={stopEditing} aria-label={t("canvas.project.cancelRename")} />
                            </>
                        ) : (
                            <>
                                {isTauri() ? (
                                    <Button
                                        type="text"
                                        size="small"
                                        shape="circle"
                                        icon={<FolderOpen className="size-3.5" />}
                                        aria-label={t("canvas.openFolder")}
                                        onClick={() => {
                                            void openCanvasWorkspaceFolder(project.id).catch((error) => {
                                                console.error(error);
                                                message.error(t("canvas.openFolderFailed"));
                                            });
                                        }}
                                    />
                                ) : null}
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
