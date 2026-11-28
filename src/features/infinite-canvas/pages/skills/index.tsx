import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Empty, Input, Spin, Tooltip, Upload } from "antd";
import { CircleHelp, FileArchive, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { isShippedBuiltinSkill, isZipMagic, normalizeSkillName, packageEntryCount, SKILL_ZIP_LIMITS } from "@canvas/lib/agent/builtin-skills";
import {
    groupSkillsByCategory,
    skillCategory,
    SKILL_CATEGORY_ORDER,
    type SkillCategoryId,
} from "@canvas/lib/agent/skill-categories";
import { useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import { useAgentStore } from "@canvas/stores/use-agent-store";
import { cn } from "@canvas/lib/utils";

const PACKAGE_STRUCTURE = `skill-name.zip
└── skill-name/
    ├── SKILL.md
    ├── references/
    ├── scripts/
    └── assets/`;

export default function SkillsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();
    const fileRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<SkillCategoryId | "all">("all");
    const [uploading, setUploading] = useState(false);
    const skills = useBuiltinSkillStore((state) => state.skills);
    const loading = useBuiltinSkillStore((state) => state.loading);
    const loaded = useBuiltinSkillStore((state) => state.loaded);
    const selectedName = useBuiltinSkillStore((state) => state.selectedName);
    const load = useBuiltinSkillStore((state) => state.load);
    const select = useBuiltinSkillStore((state) => state.select);
    const installZip = useBuiltinSkillStore((state) => state.installZip);
    const uninstall = useBuiltinSkillStore((state) => state.uninstall);
    const openPanel = useAgentStore((state) => state.openPanel);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return skills.filter((skill) => {
            if (category !== "all" && skillCategory(skill) !== category) return false;
            if (!keyword) return true;
            return [skill.name, skill.description].some((value) => value.toLowerCase().includes(keyword));
        });
    }, [category, query, skills]);

    const grouped = useMemo(() => groupSkillsByCategory(filtered), [filtered]);

    const categoryCounts = useMemo(() => {
        const counts = Object.fromEntries(SKILL_CATEGORY_ORDER.map((id) => [id, 0])) as Record<SkillCategoryId, number>;
        for (const skill of skills) counts[skillCategory(skill)] += 1;
        return counts;
    }, [skills]);

    const uploadZip = async (file: File) => {
        if (!/\.zip$/i.test(file.name) && file.type !== "application/zip" && file.type !== "application/x-zip-compressed") {
            message.error(t("skillsLibrary.zipOnly"));
            return false;
        }
        if (file.size > SKILL_ZIP_LIMITS.maxZipBytes) {
            message.error(t("skillsLibrary.zipTooLarge", { mb: Math.floor(SKILL_ZIP_LIMITS.maxZipBytes / (1024 * 1024)) }));
            return false;
        }
        setUploading(true);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!isZipMagic(bytes)) {
                message.error(t("skillsLibrary.invalidZipMagic"));
                return false;
            }
            const fallback = normalizeSkillName(file.name.replace(/\.zip$/i, "")) || "imported-skill";
            const skill = await installZip(bytes, fallback);
            message.success(t("skillsLibrary.installed", { name: skill.name }));
            if (skill.warnings?.length) {
                message.warning(skill.warnings.slice(0, 3).join("；"), 6);
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsLibrary.installFailed"));
        } finally {
            setUploading(false);
        }
        return false;
    };

    const removeSkill = (name: string) => {
        modal.confirm({
            title: t("skillsLibrary.deleteTitle", { name }),
            content: t("skillsLibrary.deleteDescription"),
            okText: t("skillsLibrary.delete"),
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await uninstall(name);
                    message.success(t("skillsLibrary.deleted", { name }));
                } catch (error) {
                    message.error(error instanceof Error ? error.message : t("skillsLibrary.deleteFailed"));
                }
            },
        });
    };

    const useInAgent = (name: string) => {
        select(name);
        const current = useAgentStore.getState().prompt;
        const cleaned = current
            .replace(/\$[a-z0-9]+(?:-[a-z0-9]+)*/gi, "")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
        useAgentStore.getState().setAgentState({ prompt: cleaned, activeTab: "chat" });
        openPanel();
        navigate("/canvas");
        message.success(t("skillsLibrary.readyInChat", { name }));
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1400px]">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">{t("skillsLibrary.title")}</h1>
                        <Tooltip
                            placement="bottomLeft"
                            styles={{ root: { maxWidth: 320 } }}
                            title={
                                <div className="space-y-1.5 py-0.5">
                                    <div className="text-xs font-medium">{t("skillsLibrary.packageHintTitle")}</div>
                                    <pre className="m-0 whitespace-pre font-mono text-[11px] leading-5 opacity-90">{PACKAGE_STRUCTURE}</pre>
                                </div>
                            }
                        >
                            <button
                                type="button"
                                className="inline-flex size-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                                aria-label={t("skillsLibrary.packageHintTitle")}
                            >
                                <CircleHelp className="size-4" />
                            </button>
                        </Tooltip>
                        <span className="ml-1 text-sm text-stone-500 dark:text-stone-400">{t("skillsLibrary.count", { count: skills.length })}</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("skillsLibrary.subtitleShort")}</p>

                    <div className="mt-4">
                        <Upload.Dragger
                            multiple={false}
                            showUploadList={false}
                            accept=".zip,application/zip,application/x-zip-compressed"
                            disabled={uploading}
                            beforeUpload={(file) => {
                                void uploadZip(file);
                                return false;
                            }}
                            className="!rounded-xl [&_.ant-upload-drag]:!border-stone-300/80 [&_.ant-upload-drag]:!bg-transparent [&_.ant-upload-drag]:!px-3 [&_.ant-upload-drag]:!py-2 dark:[&_.ant-upload-drag]:!border-stone-700"
                        >
                            <div className="flex items-center justify-between gap-3 px-1 py-0.5">
                                <div className="flex min-w-0 items-center gap-2 text-left">
                                    <FileArchive className="size-4 shrink-0 text-stone-500" />
                                    <div className="min-w-0 truncate text-sm text-stone-700 dark:text-stone-200">
                                        {uploading ? t("skillsLibrary.uploading") : t("skillsLibrary.dropZipCompact")}
                                    </div>
                                </div>
                                <Button
                                    size="small"
                                    type="primary"
                                    loading={uploading}
                                    icon={<FileArchive className="size-3.5" />}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        fileRef.current?.click();
                                    }}
                                >
                                    {t("skillsLibrary.uploadZip")}
                                </Button>
                            </div>
                        </Upload.Dragger>
                    </div>

                    <input
                        ref={fileRef}
                        hidden
                        type="file"
                        accept=".zip,application/zip,application/x-zip-compressed"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void uploadZip(file);
                        }}
                    />

                    <div className="mt-5 flex flex-col gap-3">
                        <div className="flex flex-wrap gap-1.5">
                            <CategoryChip
                                active={category === "all"}
                                label={t("skillsLibrary.categoryAll")}
                                count={skills.length}
                                onClick={() => setCategory("all")}
                            />
                            {SKILL_CATEGORY_ORDER.filter((id) => categoryCounts[id] > 0).map((id) => (
                                <CategoryChip
                                    key={id}
                                    active={category === id}
                                    label={t(`skillsLibrary.categories.${id}`)}
                                    count={categoryCounts[id]}
                                    onClick={() => setCategory(id)}
                                />
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <Input.Search
                                allowClear
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t("skillsLibrary.search")}
                                className="min-w-0 flex-1"
                            />
                            <Tooltip title={t("skillsLibrary.reload")}>
                                <Button
                                    className="!h-8 !w-8 !min-w-8 !px-0"
                                    icon={<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />}
                                    aria-label={t("skillsLibrary.reload")}
                                    onClick={() => void load(true)}
                                />
                            </Tooltip>
                        </div>
                    </div>

                    <div className="mt-5 space-y-8">
                        {loading && !loaded ? (
                            <div className="flex justify-center py-24">
                                <Spin />
                            </div>
                        ) : grouped.length ? (
                            grouped.map((group) => (
                                <section key={group.id} aria-labelledby={`skill-cat-${group.id}`}>
                                    <header className="mb-3 flex items-baseline gap-2">
                                        <h2 id={`skill-cat-${group.id}`} className="text-sm font-semibold tracking-tight text-stone-700 dark:text-stone-200">
                                            {t(`skillsLibrary.categories.${group.id}`)}
                                        </h2>
                                        <span className="text-xs text-stone-400">{group.skills.length}</span>
                                    </header>
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {group.skills.map((skill) => {
                                            const active = skill.name === selectedName;
                                            const entryCount = packageEntryCount(skill);
                                            return (
                                                <div
                                                    key={skill.path || skill.name}
                                                    className="flex h-full flex-col rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-stone-700/80 dark:bg-stone-900/50"
                                                >
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate text-base font-semibold">@{skill.name}</span>
                                                        {active ? (
                                                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-300">
                                                                {t("skillsLibrary.active")}
                                                            </span>
                                                        ) : null}
                                                        <span className="rounded-full bg-stone-500/10 px-2 py-0.5 text-[11px] text-stone-500">
                                                            {t("skillsLibrary.packageEntryCount", { count: entryCount })}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 line-clamp-3 flex-1 text-sm text-stone-500 dark:text-stone-400">
                                                        {skill.description || t("skillsLibrary.noDescription")}
                                                    </p>
                                                    <div className="mt-4 flex items-center gap-2">
                                                        <Button type={active ? "default" : "primary"} className="flex-1" onClick={() => useInAgent(skill.name)}>
                                                            {t("skillsLibrary.useInChat")}
                                                        </Button>
                                                        {isShippedBuiltinSkill(skill) ? (
                                                            <span className="px-2 text-[11px] text-stone-400">{t("skillsLibrary.shipped")}</span>
                                                        ) : (
                                                            <Button
                                                                danger
                                                                type="text"
                                                                icon={<Trash2 className="size-3.5" />}
                                                                aria-label={t("skillsLibrary.delete")}
                                                                onClick={() => removeSkill(skill.name)}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))
                        ) : (
                            <Empty className="py-16" description={t("skillsLibrary.emptyZip")} />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

function CategoryChip(props: { active: boolean; label: string; count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                props.active
                    ? "border-stone-900/15 bg-stone-900/[0.08] text-stone-950 dark:border-white/15 dark:bg-white/[0.12] dark:text-stone-50"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600",
            )}
        >
            <span>{props.label}</span>
            <span className={cn("tabular-nums opacity-60", props.active && "opacity-75")}>{props.count}</span>
        </button>
    );
}
