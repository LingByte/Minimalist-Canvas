import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, Spin } from "antd";
import { ArrowLeft, Check, ExternalLink, FileText, FolderTree, RefreshCw, Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import {
    formatSkillPackageTree,
    packageEntryCount,
    type BuiltinSkill,
    type BuiltinSkillPackageEntry,
} from "@canvas/lib/agent/builtin-skills";
import {
    groupSkillsByCategory,
    skillCategory,
    SKILL_CATEGORY_ORDER,
    type SkillCategoryId,
} from "@canvas/lib/agent/skill-categories";
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
    const [category, setCategory] = useState<SkillCategoryId | "all">("all");
    const [query, setQuery] = useState("");

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        setPreviewPath("SKILL.md");
    }, [detailName]);

    const categoryCounts = useMemo(() => {
        const counts = Object.fromEntries(SKILL_CATEGORY_ORDER.map((id) => [id, 0])) as Record<SkillCategoryId, number>;
        for (const skill of skills) counts[skillCategory(skill)] += 1;
        return counts;
    }, [skills]);

    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return skills.filter((skill) => {
            if (category !== "all" && skillCategory(skill) !== category) return false;
            if (!keyword) return true;
            return [skill.name, skill.description].some((value) => value.toLowerCase().includes(keyword));
        });
    }, [category, query, skills]);

    const grouped = useMemo(() => groupSkillsByCategory(filtered), [filtered]);

    const detail = useMemo(
        () => (detailName ? skills.find((skill) => skill.name === detailName) || null : null),
        [detailName, skills],
    );

    const useSkill = (skill: BuiltinSkill) => {
        select(skill.name);
        const current = useAgentStore.getState().prompt;
        const cleaned = current
            .replace(/\$[a-z0-9]+(?:-[a-z0-9]+)*/gi, "")
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
        const cat = skillCategory(detail);

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
                            {t(`skillsLibrary.categories.${cat}`)} · {t("skillsLibrary.packageEntryCount", { count: packageEntryCount(detail) })}
                        </div>
                    </div>
                </div>

                <p className="mb-3 line-clamp-3 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {detail.description || t("skillsLibrary.noDescription")}
                </p>

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
                    <pre className="m-0 max-h-28 overflow-auto whitespace-pre font-mono text-[11px] leading-5" style={{ color: theme.node.text }}>
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
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2.5 border-b px-3 pb-3 pt-3" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold">{t("agent.panel.skills")}</div>
                        <div className="mt-0.5 text-[11px] leading-4" style={{ color: theme.node.muted }}>
                            {t("skillsLibrary.panelHintShort")}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                            type="text"
                            size="small"
                            className="!h-7 !w-7 !min-w-7 !px-0"
                            icon={<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />}
                            onClick={() => void load(true)}
                            aria-label={t("skillsLibrary.reload")}
                        />
                        <Button
                            type="text"
                            size="small"
                            className="!h-7 !px-1.5 text-[11px]"
                            icon={<ExternalLink className="size-3" />}
                            onClick={() => navigate("/skills")}
                        >
                            {t("skillsLibrary.openLibrary")}
                        </Button>
                    </div>
                </div>

                <Input
                    allowClear
                    size="small"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("skillsLibrary.search")}
                    prefix={<Search className="size-3.5 opacity-45" />}
                />

                <div className="thin-scrollbar -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <FilterChip
                        active={category === "all"}
                        label={t("skillsLibrary.categoryAll")}
                        count={skills.length}
                        onClick={() => setCategory("all")}
                        theme={theme}
                    />
                    {SKILL_CATEGORY_ORDER.filter((id) => categoryCounts[id] > 0).map((id) => (
                        <FilterChip
                            key={id}
                            active={category === id}
                            label={t(`skillsLibrary.categories.${id}`)}
                            count={categoryCounts[id]}
                            onClick={() => setCategory(id)}
                            theme={theme}
                        />
                    ))}
                </div>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {loading && !loaded ? (
                    <div className="flex flex-1 items-center justify-center py-16">
                        <Spin />
                    </div>
                ) : grouped.length ? (
                    <div className="space-y-3">
                        {grouped.map((group) => (
                            <section key={group.id}>
                                {category === "all" ? (
                                    <div className="mb-1 px-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: theme.node.muted }}>
                                        {t(`skillsLibrary.categories.${group.id}`)}
                                        <span className="ml-1 tabular-nums opacity-70">{group.skills.length}</span>
                                    </div>
                                ) : null}
                                <div className="space-y-0.5">
                                    {group.skills.map((skill) => {
                                        const active = skill.name === selectedName;
                                        return (
                                            <div
                                                key={skill.path || skill.name}
                                                className="flex w-full items-center gap-1 rounded-lg border px-1.5 py-1.5 transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                                                style={{
                                                    borderColor: active ? theme.node.text : "transparent",
                                                    background: active ? theme.toolbar.activeBg : "transparent",
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="flex min-w-0 flex-1 items-start gap-2 px-1 py-0.5 text-left"
                                                    onClick={() => setDetailName(skill.name)}
                                                >
                                                    <span
                                                        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md"
                                                        style={{ background: theme.toolbar.panel, color: theme.node.muted }}
                                                    >
                                                        <Sparkles className="size-3" />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-1">
                                                            <span className="truncate text-[13px] font-medium leading-5">@{skill.name}</span>
                                                            {active ? <Check className="size-3 shrink-0 opacity-70" /> : null}
                                                        </span>
                                                        <span className="mt-0.5 line-clamp-1 block text-[11px] leading-4" style={{ color: theme.node.muted }}>
                                                            {skill.description || t("skillsLibrary.noDescription")}
                                                        </span>
                                                    </span>
                                                </button>
                                                <Button
                                                    type={active ? "default" : "primary"}
                                                    size="small"
                                                    className="!h-7 shrink-0 !px-2 !text-[11px]"
                                                    onClick={() => useSkill(skill)}
                                                >
                                                    {active ? t("skillsLibrary.active") : t("skillsLibrary.use")}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                    <Empty
                        className="py-12"
                        description={
                            <div className="space-y-2 text-sm" style={{ color: theme.node.muted }}>
                                <div>{error || (query || category !== "all" ? t("skillsLibrary.noMatch") : t("skillsLibrary.emptyZip"))}</div>
                                {query || category !== "all" ? (
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setQuery("");
                                            setCategory("all");
                                        }}
                                    >
                                        {t("skillsLibrary.clearFilters")}
                                    </Button>
                                ) : (
                                    <Button type="primary" size="small" onClick={() => navigate("/skills")}>
                                        {t("skillsLibrary.openLibrary")}
                                    </Button>
                                )}
                            </div>
                        }
                    />
                )}
            </div>
        </div>
    );
}

function FilterChip(props: {
    active: boolean;
    label: string;
    count: number;
    onClick: () => void;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition"
            style={{
                borderColor: props.active ? props.theme.node.text : props.theme.node.stroke,
                background: props.active ? props.theme.toolbar.activeBg : "transparent",
                color: props.theme.node.text,
            }}
        >
            <span className="whitespace-nowrap">{props.label}</span>
            <span className="tabular-nums opacity-55">{props.count}</span>
        </button>
    );
}
