import { App, Button, Switch, Tag } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toIntlLocale } from "@/i18n/languages";

import { PromptSourceEditorDrawer } from "./prompt-source-editor-drawer";
import { PromptSourceContentModal } from "./prompt-source-content-modal";
import { fetchPromptSourceStatuses } from "@canvas/services/api/prompts";
import { usePromptSourceStore } from "@canvas/stores/use-prompt-source-store";
import type { PromptSource } from "@canvas/services/api/prompt-source-presets";
import { useAuthStore } from "@/stores/auth-store";

const STATUS_QUERY_KEY = ["prompt-source-statuses"];

export function ConfigPromptSources() {
    const { message, modal } = App.useApp();
    const { i18n, t } = useTranslation();
    const queryClient = useQueryClient();
    const sources = usePromptSourceStore((state) => state.sources);
    const addSource = usePromptSourceStore((state) => state.addSource);
    const saveSource = usePromptSourceStore((state) => state.saveSource);
    const removeSource = usePromptSourceStore((state) => state.removeSource);
    const toggleSource = usePromptSourceStore((state) => state.toggleSource);
    const syncSources = usePromptSourceStore((state) => state.syncSources);
    const isAuthenticated = useAuthStore((s) => Boolean(s.auth.user && s.auth.accessToken));
    const statusQuery = useQuery({ queryKey: STATUS_QUERY_KEY, queryFn: fetchPromptSourceStatuses, enabled: isAuthenticated });

    const [editingSource, setEditingSource] = useState<PromptSource | null>(null);
    const [viewingId, setViewingId] = useState("");
    const [syncing, setSyncing] = useState(false);
    const viewingSource = sources.find((item) => item.id === viewingId) || null;

    const invalidatePrompts = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["prompts"] }),
            queryClient.invalidateQueries({ queryKey: ["side-panel-prompts"] }),
            queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY }),
        ]);
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const list = await syncSources();
            await invalidatePrompts();
            message.success(t("config.promptSources.synced", { count: list.length }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.promptSources.refreshFailed"));
        } finally {
            setSyncing(false);
        }
    };

    const handleSave = async (source: PromptSource) => {
        try {
            await saveSource(source);
            await invalidatePrompts();
            setEditingSource(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.promptSources.refreshFailed"));
        }
    };

    const handleDelete = (source: PromptSource) => {
        modal.confirm({
            title: t("config.promptSources.deleteTitle", { name: source.name }),
            content: t("config.promptSources.deleteDescription"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                await removeSource(source.id);
                await invalidatePrompts();
            },
        });
    };

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                <Button icon={<RefreshCw className="size-4" />} loading={syncing} disabled={!isAuthenticated} onClick={() => void handleSync()}>
                    {t("config.promptSources.sync")}
                </Button>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setEditingSource(addSource())}>
                    {t("config.promptSources.add")}
                </Button>
            </div>

            <div className="space-y-2">
                {sources.map((source) => {
                    const status = statusQuery.data?.[source.id];
                    return (
                        <div key={source.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
                            <Switch size="small" checked={source.enabled} onChange={(checked) => { void toggleSource(source.id, checked).then(() => invalidatePrompts()).catch((error) => message.error(error instanceof Error ? error.message : t("config.promptSources.refreshFailed"))); }} />
                            <div className="min-w-[220px] flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold">{source.name}</span>
                                    {source.builtIn ? <Tag className="m-0 shrink-0 text-[10px]">{t("config.promptSources.builtIn")}</Tag> : null}
                                </div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                                    <a className="max-w-full truncate hover:text-stone-800 hover:underline dark:hover:text-stone-200" href={source.homepage || source.url} target="_blank" rel="noreferrer">
                                        {source.homepage || source.url}
                                    </a>
                                    <span className="tabular-nums">{t("config.promptSources.itemCount", { count: status?.count ?? 0 })}</span>
                                    {status?.lastError ? <Tag color="error" className="m-0 text-[10px]" title={status.lastError}>{t("config.promptSources.failed")}</Tag> : null}
                                    <span>{status?.lastSuccessAt ? t("config.promptSources.lastSuccess", { time: formatTime(status.lastSuccessAt, i18n.resolvedLanguage) }) : t("config.promptSources.neverFetched")}</span>
                                </div>
                            </div>
                            <div className="ml-auto flex flex-wrap justify-end gap-2">
                                <Button size="small" icon={<Eye className="size-3.5" />} onClick={() => setViewingId(source.id)}>
                                    {t("config.promptSources.view")}
                                </Button>
                                {!source.builtIn ? <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingSource(source)}>{t("config.promptSources.edit")}</Button> : null}
                                {!source.builtIn ? <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => handleDelete(source)}>{t("common.delete")}</Button> : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            <PromptSourceEditorDrawer open={Boolean(editingSource)} source={editingSource} onSave={handleSave} onClose={() => setEditingSource(null)} />
            <PromptSourceContentModal source={viewingSource} onClose={() => setViewingId("")} />
        </div>
    );
}

function formatTime(value: string, locale?: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(toIntlLocale(locale), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
