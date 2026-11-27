import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Spin } from "antd";
import { ArrowLeft, Check, ExternalLink, FileText, FolderTree, RefreshCw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import {
    formatSkillPackageTree,
    packageEntryCount,
    type BuiltinSkill,
    type BuiltinSkillPackageEntry,
} from "@canvas/lib/agent/builtin-skills";
import { useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import { useAgentStore } from "@canvas/stores/use-agent-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

/** Compact Skills tab for the built-in agent: browse details; install lives in /skills. */
export function BuiltinAgentSkillsView() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const skills = useBuiltinSkillStore((state) => state.skills);
    const selectedName = useBuiltinSkillStore((state) => state.selectedName);
    const loading = useBuiltinSkillStore((state) => state.loading);
    const loaded = useBuiltinSkillStore((state) => state.loaded);
    const error = useBuiltinSkillStore((state) => state.error);
    const load = useBuiltinSkillStore((state) => state.load);
    const select = useBuiltinSkillStore((state) => state.select);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const [detailName, setDetailName] = useState<string | null>(null);
    const [previewPath, setPreviewPath] = useState<string>("SKILL.md");

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        setPreviewPath("SKILL.md");
    }, [detailName]);

    const detail = useMemo(
        () => (detailName ? skills.find((skill) => skill.name === detailName) || null : null),
        [detailName, skills],
    );

    const useSkill = (skill: BuiltinSkill) => {
        select(skill.name);
        const escaped = skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const current = useAgentStore.getState().prompt;
        const cleaned = current
            .replace(new RegExp(`\\$${escaped}\\b`, "g"), "")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
        setAgentState({ prompt: cleaned, activeTab: "chat" });
    };

    if (detail) {
        const active = detail.name === selectedName;
        const entries = detail.packageEntries?.length
            ? detail.packageEntries
            : ([
                  { path: "SKILL.md", bytes: detail.instructions.length, role: "skill", encoding: "text" },
                  ...Object.keys(detail.files || {}).map(
                      (path): BuiltinSkillPackageEntry => ({
                          path,
                          bytes: (detail.files?.[path] || "").length,
                          role: "other",
                          encoding: "text",
                      }),
                  ),
              ] satisfies BuiltinSkillPackageEntry[]);
        const tree = formatSkillPackageTree(detail.name, entries);
        const previewBody =
            previewPath === "SKILL.md"
                ? detail.instructions
                : detail.files?.[previewPath] || "";
        const previewIsText =
            previewPath === "SKILL.md" ||
            entries.find((item) => item.path === previewPath)?.encoding === "text" ||
            /\.(md|txt|json|ya?ml|toml|csv|tsv|js|ts|mjs|cjs|py|sh|html|css|svg)$/i.test(previewPath);

        return (
            <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
                <div className="mb-3 flex items-center gap-2">
                    <Button
                        type="text"
                        size="small"
                        className="!h-8 !w-8 !min-w-8 !px-0"
                        icon={<ArrowLeft className="size-3.5" />}
                        aria-label={t("common.back")}
                        onClick={() => setDetailName(null)}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">@{detail.name}</div>
                        <div className="truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>
                            {detail.description || t("skillsLibrary.noDescription")}
                        </div>
                    </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                    <Button type="primary" icon={<Sparkles className="size-3.5" />} onClick={() => useSkill(detail)}>
                        {active ? t("skillsLibrary.active") : t("skillsLibrary.useInChat")}
                    </Button>
                    {active ? (
                        <Button onClick={() => select("")}>{t("skillsLibrary.clearSelection")}</Button>
                    ) : null}
                </div>

                <div className="rounded-xl border px-3 py-3" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.node.muted }}>
                        <FolderTree className="size-3.5" />
                        {t("skillsLibrary.packageStructure")}
                    </div>
                    <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-[11px] leading-5" style={{ color: theme.node.text }}>
                        {tree}
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {entries.map((entry) => (
                            <button
                                key={entry.path}
                                type="button"
                                className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 transition"
                                style={{
                                    borderColor: previewPath === entry.path ? theme.node.text : theme.node.stroke,
                                    background: previewPath === entry.path ? theme.toolbar.activeBg : "transparent",
                                    color: theme.node.text,
                                }}
                                onClick={() => setPreviewPath(entry.path)}
                                title={entry.path}
                            >
                                <FileText className="size-3 shrink-0 opacity-60" />
                                <span className="truncate">{entry.path}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-3 rounded-xl border px-3 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.node.muted }}>
                        {previewPath === "SKILL.md" ? t("skillsLibrary.instructions") : previewPath}
                    </div>
                    {previewIsText && previewBody ? (
                        <pre className="m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5" style={{ color: theme.node.text }}>
                            {previewBody}
                        </pre>
                    ) : (
                        <div className="text-xs leading-5" style={{ color: theme.node.muted }}>
                            {t("skillsLibrary.binaryFilePreview")}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{t("agent.panel.skills")}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("skillsLibrary.panelHint")}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        type="text"
                        size="small"
                        className="!h-8 !w-8 !min-w-8 !px-0"
                        icon={<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />}
                        onClick={() => void load(true)}
                        aria-label={t("skillsLibrary.reload")}
                    />
                    <Button
                        type="text"
                        size="small"
                        className="!h-8 !px-2"
                        icon={<ExternalLink className="size-3.5" />}
                        onClick={() => navigate("/skills")}
                    >
                        {t("skillsLibrary.openLibrary")}
                    </Button>
                </div>
            </div>

            {loading && !loaded ? (
                <div className="flex flex-1 items-center justify-center py-16">
                    <Spin />
                </div>
            ) : skills.length ? (
                <div className="space-y-1.5">
                    {skills.map((skill) => {
                        const active = skill.name === selectedName;
                        const count = packageEntryCount(skill);
                        return (
                            <button
                                key={skill.path || skill.name}
                                type="button"
                                className="flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                                style={{
                                    borderColor: active ? theme.node.text : theme.node.stroke,
                                    background: active ? theme.toolbar.activeBg : "transparent",
                                }}
                                onClick={() => setDetailName(skill.name)}
                            >
                                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.toolbar.panel }}>
                                    <Sparkles className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium">@{skill.name}</span>
                                        {active ? <Check className="size-3.5 shrink-0 opacity-70" /> : null}
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 block text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {skill.description || t("skillsLibrary.noDescription")}
                                    </span>
                                    <span className="mt-1 block text-[11px]" style={{ color: theme.node.faint }}>
                                        {t("skillsLibrary.packageEntryCount", { count })}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <Empty
                    className="py-16"
                    description={
                        <div className="space-y-2 text-sm" style={{ color: theme.node.muted }}>
                            <div>{error || t("skillsLibrary.emptyZip")}</div>
                            <Button type="primary" size="small" onClick={() => navigate("/skills")}>
                                {t("skillsLibrary.openLibrary")}
                            </Button>
                        </div>
                    }
                />
            )}
        </div>
    );
}
