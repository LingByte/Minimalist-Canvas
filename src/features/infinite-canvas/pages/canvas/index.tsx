import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Input, Modal } from "antd";
import { AudioLines, FileUp, Image as ImageIcon, Layers3, Plus, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@canvas/lib/zip";
import { setMediaBlob } from "@canvas/services/file-storage";
import { setImageBlob } from "@canvas/services/image-storage";
import { CanvasDeleteProjectsDialog } from "@canvas/components/canvas/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "@canvas/components/canvas/canvas-project-card";
import { CanvasRefreshShell } from "@canvas/components/canvas/canvas-refresh-shell";
import type { CanvasExportFile } from "@canvas/types/canvas-export";
import { useCanvasStore } from "@canvas/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@canvas/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@canvas/lib/canvas/canvas-export";

import "./canvas-home.css";

export default function CanvasPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const cloudSynced = useCanvasStore((state) => state.cloudSynced);
    const projectsReady = hydrated && cloudSynced;
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const [createOpen, setCreateOpen] = useState(false);
    const [createTitle, setCreateTitle] = useState("");
    const [creating, setCreating] = useState(false);

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = (id: string) => {
        navigate(`/canvas/${id}${agentQuery}`);
    };
    const defaultTitle = () => t("canvas.defaultTitle", { count: projects.length + 1 });
    const openCreateDialog = () => {
        setCreateTitle(defaultTitle());
        setCreateOpen(true);
    };
    const confirmCreate = () => {
        const title = createTitle.trim() || defaultTitle();
        setCreating(true);
        try {
            const id = createProject(title);
            setCreateOpen(false);
            enterProject(id);
        } finally {
            setCreating(false);
        }
    };

    const sortedProjects = useMemo(
        () =>
            [...projects].sort(
                (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
            ),
        [projects],
    );

    const capabilityItems = [
        { id: "canvas", label: t("canvas.homeCapabilities.canvas"), icon: Layers3, action: () => openCreateDialog() },
        { id: "video", label: t("canvas.homeCapabilities.video"), icon: Video, to: "/video" },
        { id: "image", label: t("canvas.homeCapabilities.image"), icon: ImageIcon, to: "/image" },
        { id: "audio", label: t("canvas.homeCapabilities.audio"), icon: AudioLines, action: () => openCreateDialog() },
    ] as const;

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
        if (!projectsReady || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        enterProject(
            mode === "new"
                ? createProject(t("canvas.defaultTitle", { count: projects.length + 1 }))
                : projects[0]?.id || createProject(t("canvas.defaultTitle", { count: projects.length + 1 })),
        );
    }, [createProject, mode, projects, projectsReady, t]);

    if (!projectsReady) {
        return <CanvasRefreshShell title={t("canvas.loading")} description={t("canvas.projectLoadingHint")} />;
    }

    if (mode === "new" || mode === "recent") {
        return <CanvasRefreshShell title={t("canvas.opening")} description={t("canvas.projectLoadingHint")} />;
    }

    return (
        <main className="canvas-home" aria-label={t("canvas.title")}>
            <section className="canvas-home-hero" aria-label={t("canvas.create")}>
                <span className="canvas-home-dot-base" aria-hidden />
                <span className="canvas-home-dot-flow" aria-hidden />
                <span className="canvas-home-dot-flow canvas-home-dot-flow-delay" aria-hidden />
                <button type="button" className="canvas-home-create" onClick={openCreateDialog}>
                    <span className="canvas-home-create-icon">
                        <Plus />
                    </span>
                    <span className="canvas-home-create-title">{t("canvas.homeCreate")}</span>
                </button>
            </section>

            <nav className="canvas-home-capabilities" aria-label={t("canvas.homeCapabilitiesLabel")}>
                {capabilityItems.map((item) => {
                    const Icon = item.icon;
                    if ("to" in item && item.to) {
                        return (
                            <Link key={item.id} to={item.to} className="canvas-home-capability">
                                <span className="canvas-home-capability-icon">
                                    <Icon />
                                </span>
                                <strong>{item.label}</strong>
                            </Link>
                        );
                    }
                    return (
                        <button key={item.id} type="button" className="canvas-home-capability" onClick={item.action}>
                            <span className="canvas-home-capability-icon">
                                <Icon />
                            </span>
                            <strong>{item.label}</strong>
                        </button>
                    );
                })}
            </nav>

            <section className="canvas-home-section">
                <header className="canvas-home-section-heading">
                    <h2>
                        {t("canvas.library")}
                        {projects.length ? (
                            <span className="canvas-home-count">{t("canvas.libraryCount", { count: projects.length })}</span>
                        ) : null}
                    </h2>
                    <div className="canvas-home-section-actions">
                        {selectedIds.length ? (
                            <>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        void exportCanvasProjects(
                                            projects.filter((project) => selectedIds.includes(project.id)),
                                            `${t("canvas.title")}-${selectedIds.length}`,
                                        ).catch(() => {
                                            message.error(t("canvas.sidePanel.exportFailed"));
                                        });
                                    }}
                                >
                                    {t("canvas.exportSelected")}
                                </Button>
                                <Button size="small" onClick={() => setDeleteIds(selectedIds)}>
                                    {t("canvas.deleteSelected")}
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button size="small" onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                {t("canvas.deleteAll")}
                            </Button>
                        ) : null}
                        <Button size="small" icon={<FileUp className="size-3.5" />} onClick={() => inputRef.current?.click()}>
                            {t("canvas.import")}
                        </Button>
                    </div>
                </header>

                {sortedProjects.length ? (
                    <div className="canvas-home-card-grid">
                        {sortedProjects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <button type="button" className="canvas-home-empty" onClick={openCreateDialog}>
                        <Plus className="size-5" />
                        <span>
                            <strong>{t("canvas.emptyFirstTitle")}</strong>
                            <small>{t("canvas.emptyFirstHint")}</small>
                        </span>
                    </button>
                )}
            </section>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
            <Modal
                open={createOpen}
                title={t("canvas.create")}
                okText={t("canvas.create")}
                cancelText={t("canvas.cancel")}
                confirmLoading={creating}
                onOk={confirmCreate}
                onCancel={() => setCreateOpen(false)}
                destroyOnHidden
            >
                <div className="space-y-2 py-1">
                    <div className="text-muted-foreground text-sm">{t("canvas.createTitleHint")}</div>
                    <Input
                        autoFocus
                        value={createTitle}
                        maxLength={80}
                        placeholder={defaultTitle()}
                        onChange={(event) => setCreateTitle(event.target.value)}
                        onPressEnter={() => confirmCreate()}
                    />
                </div>
            </Modal>
        </main>
    );
}
