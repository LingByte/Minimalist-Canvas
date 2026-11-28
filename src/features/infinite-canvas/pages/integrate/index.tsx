import { useEffect, useMemo, useState } from "react";
import { App, Button } from "antd";
import { Check, Copy, Download, ExternalLink, FileText, FolderTree } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
    buildExternalMediaSkillZip,
    EXTERNAL_MEDIA_SKILL_FILES,
    EXTERNAL_MEDIA_SKILL_NAME,
    EXTERNAL_MEDIA_SKILL_ZIP,
    formatExternalSkillTree,
    parseExternalSkillFrontmatter,
} from "@canvas/lib/external-media-skill-pack";
import { saveBlobAs } from "@canvas/lib/save-file";
import { isTauri } from "@canvas/services/fs-store";
import { cn } from "@canvas/lib/utils";

const GITHUB_SKILL_URL = "https://github.com/LingByte/Minimalist-Canvas/tree/main/skills/minimalist-canvas-media";
const DEFAULT_MEDIA_API = "http://127.0.0.1:17373";

const INSTALL_TARGETS = [
    { id: "generic", path: "./skills/" },
    { id: "cursorProject", path: ".cursor/skills/" },
    { id: "cursorUser", path: "~/.cursor/skills/" },
    { id: "claudeProject", path: ".claude/skills/" },
    { id: "claudeUser", path: "~/.claude/skills/" },
] as const;

export default function IntegratePage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [downloading, setDownloading] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [previewPath, setPreviewPath] = useState("SKILL.md");
    const [mediaApi, setMediaApi] = useState(DEFAULT_MEDIA_API);

    const skillMd = EXTERNAL_MEDIA_SKILL_FILES.find((file) => file.path === "SKILL.md")?.content || "";
    const meta = useMemo(() => parseExternalSkillFrontmatter(skillMd), [skillMd]);
    const tree = useMemo(
        () => formatExternalSkillTree(EXTERNAL_MEDIA_SKILL_NAME, EXTERNAL_MEDIA_SKILL_FILES),
        [],
    );
    const previewContent =
        EXTERNAL_MEDIA_SKILL_FILES.find((file) => file.path === previewPath)?.content || "";

    useEffect(() => {
        if (!isTauri()) return;
        void import("@tauri-apps/api/core")
            .then(({ invoke }) => invoke<string>("media_api_endpoint"))
            .then((endpoint) => {
                if (endpoint) setMediaApi(endpoint);
            })
            .catch(() => undefined);
    }, []);

    const skillsAddCmd = `npx skills add LingByte/Minimalist-Canvas --skill ${EXTERNAL_MEDIA_SKILL_NAME} -g -y`;
    const healthCmd = `curl -s ${mediaApi}/health`;
    const cliCmd = `node ${EXTERNAL_MEDIA_SKILL_NAME}/scripts/canvas-media.mjs image --prompt "海报" --out ./out.png`;

    const downloadZip = async () => {
        setDownloading(true);
        try {
            const zip = await buildExternalMediaSkillZip();
            const path = await saveBlobAs(zip, EXTERNAL_MEDIA_SKILL_ZIP);
            message.success(path ? t("integrate.downloadSaved", { path }) : t("integrate.downloadStarted"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("integrate.downloadFailed"));
        } finally {
            setDownloading(false);
        }
    };

    const copyText = async (value: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(key);
            message.success(t("common.copied"));
            window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
        } catch {
            message.error(t("integrate.copyFailed"));
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col px-4 py-4 sm:px-6">
                <header className="flex shrink-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="truncate text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">
                            {t("integrate.title")}
                        </h1>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-mono text-sm font-medium text-stone-700 dark:text-stone-200">
                                @{meta.name}
                            </span>
                            <span className="text-[11px] text-stone-400">
                                {t("integrate.fileCount", { count: EXTERNAL_MEDIA_SKILL_FILES.length })}
                            </span>
                            <code className="font-mono text-[11px] text-stone-500 dark:text-stone-400">{mediaApi}</code>
                        </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button
                            type="primary"
                            icon={<Download className="size-3.5" />}
                            loading={downloading}
                            onClick={() => void downloadZip()}
                        >
                            {t("integrate.downloadZip")}
                        </Button>
                        <Button
                            href={GITHUB_SKILL_URL}
                            target="_blank"
                            rel="noreferrer"
                            icon={<ExternalLink className="size-3.5" />}
                        >
                            {t("integrate.viewOnGithub")}
                        </Button>
                    </div>
                </header>

                <div className="mt-4 grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.28fr)] lg:gap-8">
                    <section className="thin-scrollbar min-h-0 overflow-y-auto pr-1">
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                            <FolderTree className="size-3.5" />
                            {t("integrate.packageStructure")}
                        </div>
                        <pre className="m-0 whitespace-pre font-mono text-[11px] leading-5 text-stone-700 dark:text-stone-300">
                            {tree}
                        </pre>

                        <div className="mt-4 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                            {t("integrate.installTargets")}
                        </div>
                        <ul className="space-y-1 text-[12px] text-stone-600 dark:text-stone-300">
                            {INSTALL_TARGETS.map((target) => (
                                <li key={target.id} className="flex items-baseline gap-2">
                                    <span className="w-[5.5rem] shrink-0 text-stone-400">
                                        {t(`integrate.targets.${target.id}`)}
                                    </span>
                                    <code className="font-mono text-[11px] text-stone-800 dark:text-stone-200">
                                        {target.path}
                                    </code>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-4 space-y-2.5">
                            <CommandRow
                                label={t("integrate.localApi")}
                                command={healthCmd}
                                copied={copied === "health"}
                                onCopy={() => void copyText(healthCmd, "health")}
                                copyLabel={t("integrate.copyCommand")}
                            />
                            <CommandRow
                                label={t("integrate.skillsCli")}
                                command={skillsAddCmd}
                                copied={copied === "skills"}
                                onCopy={() => void copyText(skillsAddCmd, "skills")}
                                copyLabel={t("integrate.copyCommand")}
                            />
                            <CommandRow
                                label={t("integrate.cliSmoke")}
                                command={cliCmd}
                                copied={copied === "cli"}
                                onCopy={() => void copyText(cliCmd, "cli")}
                                copyLabel={t("integrate.copyCommand")}
                            />
                        </div>

                        <p className="mt-3 text-[11px] leading-relaxed text-stone-400 dark:text-stone-500">
                            {t("integrate.footnote")}
                        </p>
                    </section>

                    <section className="flex min-h-0 flex-col overflow-hidden">
                        <div className="mb-2 shrink-0 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                            {t("integrate.preview")}
                        </div>
                        <div className="mb-2 flex shrink-0 flex-wrap gap-1">
                            {EXTERNAL_MEDIA_SKILL_FILES.map((file) => {
                                const active = previewPath === file.path;
                                return (
                                    <button
                                        key={file.path}
                                        type="button"
                                        onClick={() => setPreviewPath(file.path)}
                                        aria-pressed={active}
                                        className={cn(
                                            "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition",
                                            active
                                                ? "border-stone-400 bg-stone-200 text-stone-900 dark:border-stone-500 dark:bg-stone-700 dark:text-stone-50"
                                                : "border-transparent text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800/80 dark:hover:text-stone-200",
                                        )}
                                    >
                                        <FileText className="size-3 shrink-0 opacity-70" />
                                        <span className="truncate">{file.path}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <pre className="thin-scrollbar m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-stone-200/70 bg-stone-50/50 p-3 font-mono text-[11px] leading-5 text-stone-700 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300">
                            {previewContent}
                        </pre>
                    </section>
                </div>
            </div>
        </div>
    );
}

function CommandRow({
    label,
    command,
    copied,
    onCopy,
    copyLabel,
}: {
    label: string;
    command: string;
    copied: boolean;
    onCopy: () => void;
    copyLabel: string;
}) {
    return (
        <div>
            <div className="mb-0.5 text-[11px] text-stone-400">{label}</div>
            <div className="flex items-start gap-1">
                <code className="min-w-0 flex-1 break-all font-mono text-[11px] leading-4 text-stone-700 dark:text-stone-300">
                    {command}
                </code>
                <Button
                    type="text"
                    size="small"
                    className="!h-6 !w-6 !min-w-6 !shrink-0 !p-0 !text-stone-400 hover:!text-stone-800 dark:hover:!text-stone-100"
                    icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    onClick={onCopy}
                    aria-label={copyLabel}
                />
            </div>
        </div>
    );
}
