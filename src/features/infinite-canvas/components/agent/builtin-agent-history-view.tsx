import { useState } from "react";
import { Button, Checkbox } from "antd";
import { MessagesSquare, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toIntlLocale } from "@/i18n/languages";

import { canvasThemes } from "@canvas/lib/canvas-theme";
import type { BuiltinThreadSummary } from "@canvas/lib/agent/builtin-agent-session";

/** Thread list for the built-in agent — local kvStore threads (title + updatedAt). */
export function BuiltinAgentHistoryView({
    theme,
    threads,
    activeThreadId,
    busy,
    onRefresh,
    onNewThread,
    onOpenThread,
    onDeleteThreads,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    threads: BuiltinThreadSummary[];
    activeThreadId: string;
    busy: boolean;
    onRefresh: () => void;
    onNewThread: () => void;
    onOpenThread: (threadId: string) => void;
    onDeleteThreads: (threadIds: string[]) => void;
}) {
    const { i18n, t } = useTranslation();
    const [selectedIds, setSelectedIds] = useState(() => new Set<string>());
    const selectedThreads = threads.filter((thread) => selectedIds.has(thread.id));
    const allSelected = Boolean(threads.length) && selectedThreads.length === threads.length;
    const toggleThread = (threadId: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(threadId)) next.delete(threadId);
            else next.add(threadId);
            return next;
        });
    };
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm" style={{ color: theme.node.muted }}>
                        {threads.length ? (
                            <Checkbox
                                checked={allSelected}
                                indeterminate={Boolean(selectedThreads.length) && !allSelected}
                                disabled={busy}
                                onChange={() => setSelectedIds(allSelected ? new Set() : new Set(threads.map((thread) => thread.id)))}
                            />
                        ) : null}
                        <span>
                            {selectedThreads.length
                                ? t("agent.history.selected", { count: selectedThreads.length })
                                : threads.length
                                  ? t("agent.history.count", { count: threads.length })
                                  : t("agent.history.empty")}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedThreads.length ? (
                            <Button
                                size="small"
                                danger
                                type="text"
                                icon={<Trash2 className="size-3.5" />}
                                disabled={busy}
                                onClick={() => {
                                    onDeleteThreads(selectedThreads.map((thread) => thread.id));
                                    setSelectedIds(new Set());
                                }}
                            >
                                {t("agent.history.deleteCount", { count: selectedThreads.length })}
                            </Button>
                        ) : null}
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} disabled={busy} onClick={onRefresh}>
                            {t("agent.history.refresh")}
                        </Button>
                        <Button size="small" type="primary" icon={<Plus className="size-3.5" />} disabled={busy} onClick={onNewThread}>
                            {t("agent.history.newThread")}
                        </Button>
                    </div>
                </div>
                <div className="space-y-2">
                    {threads.map((thread) => {
                        const active = thread.id === activeThreadId;
                        return (
                            <div
                                key={thread.id}
                                role="button"
                                tabIndex={busy ? -1 : 0}
                                className={`${busy ? "cursor-default opacity-60" : "cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"} rounded-lg border px-2.5 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/20`}
                                style={{ borderColor: active ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onClick={() => {
                                    if (!busy) onOpenThread(thread.id);
                                }}
                                onKeyDown={(event) => {
                                    if (busy || (event.key !== "Enter" && event.key !== " ")) return;
                                    event.preventDefault();
                                    onOpenThread(thread.id);
                                }}
                            >
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={selectedIds.has(thread.id)}
                                        disabled={busy}
                                        aria-label={t("agent.history.selectThread", { name: thread.title || t("agent.history.untitled") })}
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                        onChange={() => toggleThread(thread.id)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            {active ? (
                                                <span className="shrink-0 text-[10px] font-medium" style={{ color: theme.node.text }}>
                                                    {t("agent.history.current")}
                                                </span>
                                            ) : null}
                                            <div className="truncate text-sm font-medium leading-5">{thread.title || t("agent.history.untitled")}</div>
                                        </div>
                                        {thread.preview && thread.preview !== thread.title ? (
                                            <div className="truncate text-[11px] leading-4 opacity-65">{thread.preview}</div>
                                        ) : null}
                                    </div>
                                    <span className="shrink-0 text-[10px] opacity-55">{formatThreadTime(thread.updatedAt, i18n.language)}</span>
                                </div>
                            </div>
                        );
                    })}
                    {!threads.length ? (
                        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                            <MessagesSquare className="size-5 opacity-60" />
                            {t("agent.history.empty")}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function formatThreadTime(value: number | undefined, locale: string) {
    if (!value) return "";
    return new Date(value).toLocaleString(toIntlLocale(locale));
}
