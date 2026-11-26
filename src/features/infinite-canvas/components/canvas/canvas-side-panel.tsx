import { memo, useEffect, useMemo, useState } from "react";
import { App, Drawer, Empty, Input, Select, Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import {
    BookOpen,
    Check,
    ChevronRight,
    Clapperboard,
    Download,
    Eye,
    FileText,
    Image as ImageIcon,
    ListVideo,
    Music2,
    Plus,
    Search,
    Settings2,
    Square,
    Type,
    Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes, type CanvasTheme } from "@canvas/lib/canvas-theme";
import { exportCanvasNodes } from "@canvas/lib/canvas/canvas-export";
import { getNodeDefinition } from "@canvas/lib/canvas/node-registry";
import { cn } from "@canvas/lib/utils";
import { PromptDetailDialog } from "@canvas/pages/prompts/components/prompt-detail-dialog";
import { fetchSourcePrompts, type Prompt } from "@canvas/services/api/prompts";
import { usePromptSourceStore } from "@canvas/stores/use-prompt-source-store";
import { useCanvasSidePanelStore } from "@canvas/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@canvas/types/canvas";

import type { InsertAssetPayload } from "./asset-picker-modal";

type Props = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onFocusNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
};

const NODE_TYPE_ICON: Record<string, typeof Square> = {
    [CanvasNodeType.Image]: ImageIcon,
    [CanvasNodeType.Video]: Video,
    [CanvasNodeType.Audio]: Music2,
    [CanvasNodeType.Text]: Type,
    [CanvasNodeType.Config]: Settings2,
    [CanvasNodeType.Group]: Square,
    [CanvasNodeType.Director]: Clapperboard,
    [CanvasNodeType.Script]: ListVideo,
};

const STATUS_COLOR: Record<string, string> = {
    success: "#22c55e",
    loading: "#f59e0b",
    error: "#ef4444",
    idle: "transparent",
};

/** Left drawer for canvas elements — same gameplay shell as team. */
export function CanvasSidePanel({ nodes, selectedNodeIds, onFocusNode, onPreviewNode }: Props) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const closePanel = useCanvasSidePanelStore((state) => state.closePanel);

    return (
        <Drawer
            open={panelOpen}
            onClose={closePanel}
            placement="left"
            size={320}
            title={t("canvas.sidePanel.elements")}
            destroyOnHidden
            styles={{
                body: { padding: 0, height: "100%", overflow: "hidden", color: theme.node.text },
                header: { borderBottomColor: theme.toolbar.border },
            }}
        >
            <div
                className="h-full min-h-0"
                style={{ color: theme.node.text }}
                data-canvas-no-zoom
                onWheelCapture={(event) => event.stopPropagation()}
            >
                <CanvasNodesTab
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    onFocusNode={onFocusNode}
                    onPreviewNode={onPreviewNode}
                    theme={theme}
                />
            </div>
        </Drawer>
    );
}

const NODE_FILTER_VALUES = [
    "all",
    CanvasNodeType.Image,
    CanvasNodeType.Video,
    CanvasNodeType.Text,
    CanvasNodeType.Audio,
    CanvasNodeType.Config,
    CanvasNodeType.Group,
    CanvasNodeType.Director,
    CanvasNodeType.Script,
];

function nodePreviewText(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return getNodeDefinition(node.type)?.title || node.type;
}

function CanvasNodesTab({
    nodes,
    selectedNodeIds,
    onFocusNode,
    onPreviewNode,
    theme,
}: {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onFocusNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
    theme: CanvasTheme;
}) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [keyword, setKeyword] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [selectMode, setSelectMode] = useState(false);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return nodes.filter(
            (node) =>
                (typeFilter === "all" || node.type === typeFilter) &&
                (!query ||
                    [node.title, node.metadata?.content, node.metadata?.prompt]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase()
                        .includes(query)),
        );
    }, [nodes, keyword, typeFilter]);

    const exitSelect = () => {
        setSelectMode(false);
        setChecked(new Set());
    };
    const toggleChecked = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const allChecked = filtered.length > 0 && filtered.every((node) => checked.has(node.id));
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map((node) => node.id)));

    const handleExport = async () => {
        const targets = nodes.filter((node) => checked.has(node.id));
        if (!targets.length) return;
        const hide = message.loading(t("canvas.sidePanel.exporting"), 0);
        try {
            setExporting(true);
            await exportCanvasNodes(targets, t("canvas.sidePanel.exportName", { count: targets.length }));
            message.success(t("canvas.sidePanel.exported", { count: targets.length }));
            exitSelect();
        } catch {
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide();
            setExporting(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-3">
                <span className="text-xs font-medium opacity-60">{t("canvas.sidePanel.elements")}</span>
                <button
                    type="button"
                    onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                    className="ml-auto rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                >
                    {selectMode ? t("common.cancel") : t("canvas.sidePanel.select")}
                </button>
                {selectMode ? null : (
                    <Select
                        size="small"
                        variant="borderless"
                        className="w-20"
                        value={typeFilter}
                        onChange={setTypeFilter}
                        options={NODE_FILTER_VALUES.map((value) => ({
                            value,
                            label: value === "all" ? t("common.all") : t(`canvas.sidePanel.filter.${value}`),
                        }))}
                    />
                )}
            </div>
            <div className="px-3 pb-2">
                <Input
                    size="small"
                    allowClear
                    prefix={<Search className="size-3.5 text-slate-400" />}
                    placeholder={t("canvas.sidePanel.searchNodes")}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
                {filtered.length ? (
                    <div className="space-y-0.5">
                        {filtered.map((node) => {
                            const Icon = NODE_TYPE_ICON[node.type] || Square;
                            const selected = selectedNodeIds.has(node.id);
                            const status = node.metadata?.status || "idle";
                            const preview = nodePreviewText(node);
                            return (
                                <div
                                    key={node.id}
                                    className={cn(
                                        "group flex items-center gap-0.5 rounded-lg transition",
                                        selected ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5",
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => (selectMode ? toggleChecked(node.id) : onFocusNode(node.id))}
                                        className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                                        title={selectMode ? undefined : t("canvas.sidePanel.focusNode")}
                                    >
                                        {selectMode ? <CheckMark checked={checked.has(node.id)} theme={theme} /> : null}
                                        <span className="relative grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.node.panel }}>
                                            <Icon className="size-3.5 opacity-70" />
                                            {status !== "idle" ? (
                                                <span
                                                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full"
                                                    style={{ background: STATUS_COLOR[status] || "transparent" }}
                                                />
                                            ) : null}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium leading-snug">{node.title || preview}</span>
                                            <span className="mt-0.5 block truncate text-xs leading-snug opacity-45">{preview}</span>
                                        </span>
                                    </button>
                                    {!selectMode ? (
                                        <button
                                            type="button"
                                            onClick={() => onPreviewNode(node.id)}
                                            className="mr-1 grid size-7 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                                            aria-label={t("canvas.sidePanel.preview")}
                                            title={t("canvas.sidePanel.preview")}
                                        >
                                            <Eye className="size-3.5" />
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="pt-16 text-center text-sm opacity-40">{t("canvas.sidePanel.noNodes")}</div>
                )}
            </div>
            {selectMode ? (
                <div className="flex items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: theme.toolbar.border }}>
                    <button
                        type="button"
                        onClick={toggleAll}
                        className="rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    >
                        {allChecked ? t("canvas.sidePanel.clearAll") : t("workbench.selectAll")}
                    </button>
                    <span className="text-xs opacity-45">{t("canvas.sidePanel.selected", { count: checked.size })}</span>
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={!checked.size || exporting}
                        className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                        style={{ color: theme.node.text }}
                    >
                        <Download className="size-3.5" />
                        {t("canvas.exportSelected")}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function CheckMark({ checked, theme }: { checked: boolean; theme: CanvasTheme }) {
    return (
        <span
            className="grid size-4 shrink-0 place-items-center rounded border transition"
            style={{
                borderColor: checked ? theme.toolbar.activeText : theme.node.stroke,
                background: checked ? theme.toolbar.activeText : "transparent",
            }}
        >
            {checked ? <Check className="size-3 text-white" /> : null}
        </span>
    );
}

/** Prompt library content for the right-side drawer. */
export const CanvasPromptsTab = memo(function CanvasPromptsTab({
    onInsert,
    theme,
}: {
    onInsert: (payload: InsertAssetPayload) => void;
    theme: CanvasTheme;
}) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const sources = usePromptSourceStore((state) => state.sources);
    const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources]);
    const [keyword, setKeyword] = useState("");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [detail, setDetail] = useState<Prompt | null>(null);

    const copyPrompt = async (prompt: string) => {
        try {
            await navigator.clipboard.writeText(prompt);
            message.success(t("canvas.sidePanel.promptCopied"));
        } catch {
            message.error(t("canvas.sidePanel.copyFailed"));
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="px-3 pb-2.5 pt-1">
                <Input
                    size="small"
                    allowClear
                    prefix={<Search className="size-3.5 text-slate-400" />}
                    placeholder={t("canvas.sidePanel.searchPrompts")}
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
                <div className="space-y-1">
                    {enabledSources.length ? (
                        enabledSources.map((source) => (
                            <PromptSourceGroup
                                key={source.id}
                                sourceId={source.id}
                                sourceName={source.name}
                                keyword={keyword}
                                open={!!expanded[source.id]}
                                theme={theme}
                                onToggle={() => setExpanded((prev) => ({ ...prev, [source.id]: !prev[source.id] }))}
                                onInsert={onInsert}
                                onView={setDetail}
                            />
                        ))
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.sidePanel.noPrompts")} className="pt-12" />
                    )}
                </div>
            </div>
            <PromptDetailDialog prompt={detail} onClose={() => setDetail(null)} onCopy={(prompt) => void copyPrompt(prompt)} />
        </div>
    );
});

function PromptSourceGroup({
    sourceId,
    sourceName,
    keyword,
    open,
    theme,
    onToggle,
    onInsert,
    onView,
}: {
    sourceId: string;
    sourceName: string;
    keyword: string;
    open: boolean;
    theme: CanvasTheme;
    onToggle: () => void;
    onInsert: (payload: InsertAssetPayload) => void;
    onView: (prompt: Prompt) => void;
}) {
    const { t } = useTranslation();
    const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    const showResults = open || !!debouncedKeyword.trim();
    const query = useQuery({
        queryKey: ["side-panel-prompts", sourceId],
        queryFn: () => fetchSourcePrompts(sourceId),
        enabled: showResults,
        staleTime: 1000 * 60 * 5,
    });

    const items = useMemo(() => {
        const all = query.data || [];
        const q = debouncedKeyword.trim().toLowerCase();
        if (!q) return all;
        return all.filter((item) => [item.title, item.prompt].join(" ").toLowerCase().includes(q));
    }, [debouncedKeyword, query.data]);

    const insertPrompt = (item: Prompt) => onInsert({ kind: "text", content: item.prompt, title: item.title });

    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100"
            >
                <ChevronRight className={cn("size-3.5 transition-transform", showResults && "rotate-90")} />
                <BookOpen className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{sourceName}</span>
                {showResults && query.isSuccess ? <span className="opacity-50">{items.length}</span> : null}
            </button>
            {showResults ? (
                <div className="px-1 pb-2 pt-1">
                    {query.isLoading ? (
                        <div className="flex justify-center py-6">
                            <Spin size="small" />
                        </div>
                    ) : query.isError ? (
                        <button
                            type="button"
                            onClick={() => void query.refetch()}
                            className="block w-full py-4 text-center text-xs text-red-500 opacity-80 transition hover:opacity-100"
                        >
                            {t("canvas.sidePanel.loadFailedRetry")}
                        </button>
                    ) : items.length ? (
                        <div className="space-y-1.5">
                            {items.map((item) => (
                                <PromptRow
                                    key={`${item.sourceId}:${item.id}`}
                                    item={item}
                                    theme={theme}
                                    onInsert={() => insertPrompt(item)}
                                    onView={() => onView(item)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="py-4 text-center text-xs opacity-40">
                            {debouncedKeyword.trim() ? t("canvas.sidePanel.noMatchingPrompts") : t("canvas.sidePanel.sourceEmpty")}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function PromptRow({
    item,
    theme,
    onInsert,
    onView,
}: {
    item: Prompt;
    theme: CanvasTheme;
    onInsert: () => void;
    onView: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="group relative flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-black/5 dark:hover:bg-white/5">
            {item.coverUrl ? (
                <img src={item.coverUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" loading="lazy" />
            ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-md" style={{ background: theme.node.panel }}>
                    <FileText className="size-4 opacity-50" />
                </span>
            )}
            <button type="button" onClick={onView} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium leading-snug">{item.title}</div>
                <div className="mt-0.5 truncate text-xs leading-snug opacity-50">{item.prompt}</div>
            </button>
            <div className="flex shrink-0 flex-col items-center gap-0.5">
                <button
                    type="button"
                    onClick={onView}
                    className="grid size-6 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                    aria-label={t("canvas.sidePanel.viewDetails")}
                    title={t("canvas.sidePanel.viewDetails")}
                >
                    <Eye className="size-3.5" />
                </button>
                <button
                    type="button"
                    onClick={onInsert}
                    className="grid size-6 place-items-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                    style={{ color: theme.toolbar.activeText }}
                    aria-label={t("canvas.sidePanel.inserted")}
                    title={t("canvas.sidePanel.inserted")}
                >
                    <Plus className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
