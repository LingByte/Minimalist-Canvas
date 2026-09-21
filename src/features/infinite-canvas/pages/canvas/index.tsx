import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button } from "antd";
import { Download, FileUp, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@canvas/lib/zip";
import { setMediaBlob } from "@canvas/services/file-storage";
import { setImageBlob } from "@canvas/services/image-storage";
import { CanvasDeleteProjectsDialog } from "@canvas/components/canvas/canvas-delete-projects-dialog";
import { CanvasEmptyPreview } from "@canvas/components/canvas/canvas-project-preview";
import { CanvasProjectCard } from "@canvas/components/canvas/canvas-project-card";
import type { CanvasExportFile } from "@canvas/types/canvas-export";
import { useCanvasStore } from "@canvas/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@canvas/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@canvas/lib/canvas/canvas-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const clearSelected = useCanvasUiStore((state) => state.clearSelectedProjectIds);

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = (id: string) => {
        navigate(`/canvas/${id}${agentQuery}`);
    };
    const createAndEnter = () => enterProject(createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(t("canvas.imported", { count: data.projects.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (!hydrated || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        enterProject(mode === "new" ? createProject(t("canvas.defaultTitle", { count: projects.length + 1 })) : projects[0]?.id || createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
    }, [createProject, hydrated, mode, projects, t]);

    if (hydrated && (mode === "new" || mode === "recent")) {
        return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500">{t("canvas.opening")}</main>;
    }

    const selectedProjects = projects.filter((project) => selectedIds.includes(project.id));

    return (
        <main className="relative h-full overflow-auto text-stone-950 dark:text-stone-100">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                    background:
                        "radial-gradient(ellipse 80% 45% at 50% -5%, rgba(120,113,108,0.18), transparent 55%), radial-gradient(ellipse 45% 35% at 90% 20%, rgba(68,64,60,0.1), transparent 50%), linear-gradient(180deg, #f7f5f0 0%, #f4f2ed 42%, #f7f5f0 100%)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] dark:opacity-[0.22]"
                style={{
                    backgroundImage: "radial-gradient(rgba(28,25,23,0.18) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    maskImage: "radial-gradient(ellipse 75% 55% at 50% 12%, black, transparent)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
                style={{
                    background:
                        "radial-gradient(ellipse 80% 45% at 50% -5%, rgba(168,162,158,0.14), transparent 55%), linear-gradient(180deg, #0c0a09 0%, #181715 48%, #0c0a09 100%)",
                }}
            />

            <div className="mx-auto flex w-full max-w-6xl flex-col px-5 pt-7 pb-12 md:px-6 md:pt-9">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 max-w-xl">
                        <p className="text-[10px] font-semibold tracking-[0.2em] text-stone-500 uppercase dark:text-stone-400">{t("canvas.library")}</p>
                        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl dark:text-stone-50">{t("canvas.title")}</h1>
                        <p className="mt-1.5 text-sm leading-5 text-stone-500 dark:text-stone-400">{t("canvas.libraryDescription")}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button disabled={!hydrated} type="primary" className="!h-9 !rounded-full !px-4" icon={<Plus className="size-3.5" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                        <Button disabled={!hydrated} className="!h-9 !rounded-full !px-3.5" icon={<FileUp className="size-3.5" />} onClick={() => inputRef.current?.click()}>
                            {t("canvas.import")}
                        </Button>
                        {projects.length ? (
                            <Button disabled={!hydrated} type="text" size="small" className="!text-stone-500" onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                {t("canvas.deleteAll")}
                            </Button>
                        ) : null}
                    </div>
                </header>

                {selectedIds.length ? (
                    <div className="sticky top-2 z-20 mt-5 flex items-center justify-between gap-3 rounded-xl border border-stone-300/80 bg-white/85 px-3 py-2 shadow-sm backdrop-blur transition duration-200 dark:border-stone-700 dark:bg-stone-950/85">
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{t("canvas.selectedCount", { count: selectedIds.length })}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                                size="small"
                                disabled={!hydrated}
                                icon={<Download className="size-3.5" />}
                                onClick={() => void exportCanvasProjects(selectedProjects, `${t("canvas.title")}-${selectedIds.length}`)}
                            >
                                {t("canvas.exportSelected")}
                            </Button>
                            <Button size="small" disabled={!hydrated} danger icon={<Trash2 className="size-3.5" />} onClick={() => setDeleteIds(selectedIds)}>
                                {t("canvas.deleteSelected")}
                            </Button>
                            <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={clearSelected} aria-label={t("canvas.clearSelection")}>
                                {t("canvas.clearSelection")}
                            </Button>
                        </div>
                    </div>
                ) : null}

                <section className="mt-6">
                    {!hydrated ? (
                        <div className="flex min-h-[200px] items-center justify-center text-sm text-stone-500">{t("canvas.loading")}</div>
                    ) : projects.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {projects.map((project) => (
                                <CanvasProjectCard key={project.id} project={project} />
                            ))}
                        </div>
                    ) : (
                        <div className="mx-auto flex max-w-sm flex-col items-center py-8 text-center">
                            <CanvasEmptyPreview />
                            <h2 className="mt-5 text-lg font-semibold tracking-tight">{t("canvas.empty")}</h2>
                            <p className="mt-1.5 text-sm leading-5 text-stone-500">{t("canvas.emptyDescription")}</p>
                            <Button type="primary" className="mt-5 !h-9 !rounded-full !px-4" icon={<Plus className="size-3.5" />} onClick={createAndEnter}>
                                {t("canvas.create")}
                            </Button>
                        </div>
                    )}
                </section>
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
