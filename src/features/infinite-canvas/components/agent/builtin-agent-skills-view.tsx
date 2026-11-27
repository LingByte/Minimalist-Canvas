import { useEffect } from "react";
import { Button, Empty, Spin } from "antd";
import { Check, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useBuiltinSkillStore } from "@canvas/stores/use-builtin-skill-store";
import { useAgentStore } from "@canvas/stores/use-agent-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";

/** Compact Skills tab for the built-in agent: browse/select; install lives in /skills. */
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

    useEffect(() => {
        void load();
    }, [load]);

    const useSkill = (name: string) => {
        select(name);
        const marker = `$${name}`;
        const current = useAgentStore.getState().prompt;
        const next = !current.trim()
            ? marker
            : current.includes(marker)
              ? current
              : `${current}${/\s$/.test(current) ? "" : " "}${marker}`;
        setAgentState({ prompt: next, activeTab: "chat" });
    };

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
                <div className="space-y-2">
                    {skills.map((skill) => {
                        const active = skill.name === selectedName;
                        return (
                            <button
                                key={skill.path || skill.name}
                                type="button"
                                className="flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                                style={{
                                    borderColor: active ? theme.node.text : theme.node.stroke,
                                    background: active ? theme.toolbar.activeBg : "transparent",
                                }}
                                onClick={() => useSkill(skill.name)}
                            >
                                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.toolbar.panel }}>
                                    <Sparkles className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium">@{skill.name}</span>
                                        {active ? <Check className="size-3.5 shrink-0 opacity-70" /> : null}
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {skill.description || t("skillsLibrary.noDescription")}
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
                            <div>{error || t("skillsLibrary.empty")}</div>
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
