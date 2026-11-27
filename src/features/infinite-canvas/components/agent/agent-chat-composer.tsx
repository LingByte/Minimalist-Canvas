import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import { ArrowUp, Check, ChevronUp, Cpu, FileText, Gauge, Hand, LoaderCircle, Paperclip, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@canvas/components/ui/select";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useAgentStore, type AgentModel, type AgentPermissionMode, type AgentReasoningEffort } from "@canvas/stores/use-agent-store";
import type { AgentChatAttachment } from "./agent-chat-message";
import { AgentChatPromptInput } from "./agent-chat-prompt-input";
import { SmartImage } from "@/components/smart-image";

function isImageAttachment(item: AgentChatAttachment) {
    return (item.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(item.url || item.name || "");
}

export function AgentChatComposer({
    prompt,
    attachments = [],
    disabled,
    sending,
    placeholder,
    theme,
    onPromptChange,
    onSubmit,
    onStop,
    onAddFiles,
    onRemoveAttachment,
    confirmTools,
    onConfirmToolsChange,
    permissionMode,
    onPermissionModeChange,
    models,
    model,
    reasoningEffort,
    onModelChange,
    onReasoningEffortChange,
    left,
    hint,
}: {
    prompt: string;
    attachments?: AgentChatAttachment[];
    disabled?: boolean;
    sending?: boolean;
    placeholder: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    onAddFiles?: (files: FileList | File[] | null) => void | Promise<void>;
    onRemoveAttachment?: (id: string) => void;
    confirmTools?: boolean;
    onConfirmToolsChange?: (confirmTools: boolean) => void;
    permissionMode?: AgentPermissionMode;
    onPermissionModeChange?: (permissionMode: AgentPermissionMode) => void;
    models?: AgentModel[];
    model?: string;
    reasoningEffort?: AgentReasoningEffort | "";
    onModelChange?: (model: string) => void;
    onReasoningEffortChange?: (effort: AgentReasoningEffort) => void;
    left?: ReactNode;
    hint?: ReactNode;
}) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const dragDepthRef = useRef(0);
    const canvasReferences = useAgentStore((state) => state.canvasReferences);
    const promptWithoutSkill = prompt.replace(/\$[a-z0-9]+(?:-[a-z0-9]+)*/gi, "").trim();
    const canSubmit = !disabled && !sending && Boolean(promptWithoutSkill || attachments.length || canvasReferences.length);
    const canDrop = Boolean(onAddFiles) && !disabled && !sending;

    const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
        if (!canDrop || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
    };
    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (!canDrop || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
        if (!canDrop) return;
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!canDrop) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        const files = event.dataTransfer.files;
        if (files?.length) void onAddFiles?.(files);
    };

    return (
        <div className="px-2.5 pb-2.5 pt-1" onWheelCapture={(event) => event.stopPropagation()}>
            <div
                className="relative rounded-[1.25rem] border px-3.5 pb-3 pt-3 shadow-sm transition-[box-shadow,border-color,background-color,transform] duration-200 focus-within:shadow-md"
                style={{
                    background: theme.toolbar.panel,
                    borderColor: dragging ? theme.node.text : sending ? `${theme.node.text}55` : theme.node.stroke,
                    boxShadow: dragging
                        ? `0 0 0 1px ${theme.node.text}`
                        : sending
                          ? `0 8px 24px -18px ${theme.node.text}`
                          : undefined,
                }}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
                {dragging ? (
                    <div
                        className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl text-xs font-medium"
                        style={{ background: "rgba(28,25,23,.06)", color: theme.node.text }}
                    >
                        {t("agent.composer.dropAttachments")}
                    </div>
                ) : null}
                {attachments.length ? (
                    <div className="thin-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
                        {attachments.map((item) => (
                            <div key={item.id} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke }} title={item.name}>
                                {isImageAttachment(item) ? (
                                    <SmartImage src={item.url} alt={item.name} className="size-full object-cover" fallbackClassName="size-full" fallbackIconClassName="size-4" />
                                ) : (
                                    <div className="flex size-full flex-col items-center justify-center gap-0.5 px-1 text-center" style={{ color: theme.node.muted, background: theme.toolbar.activeBg }}>
                                        <FileText className="size-4" />
                                        <span className="w-full truncate text-[9px] leading-3">{item.name}</span>
                                    </div>
                                )}
                                {onRemoveAttachment ? (
                                    <button type="button" className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => onRemoveAttachment(item.id)} aria-label={t("agent.composer.removeAttachment")}>
                                        <X className="size-3" />
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
                <AgentChatPromptInput value={prompt} disabled={disabled || sending} placeholder={placeholder} theme={theme} onChange={onPromptChange} onSubmit={() => { if (canSubmit) void onSubmit(); }} onAddFiles={onAddFiles} />
                <div className="@container mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-0.5">
                        {onAddFiles ? (
                            <>
                                <input ref={fileInputRef} hidden type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.md,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" multiple onChange={(event) => {
                                    void onAddFiles(event.target.files);
                                    event.target.value = "";
                                }} />
                                <Tooltip title={t("agent.composer.uploadAttachment")}>
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" disabled={disabled || sending} style={{ color: theme.node.muted }} icon={<Paperclip className="size-3.5" />} onClick={() => fileInputRef.current?.click()} aria-label={t("agent.composer.uploadAttachment")} />
                                </Tooltip>
                            </>
                        ) : null}
                        {onConfirmToolsChange ? <ToolConfirmationMenu confirmTools={Boolean(confirmTools)} theme={theme} onChange={onConfirmToolsChange} /> : null}
                        {permissionMode && onPermissionModeChange ? <PermissionModeMenu permissionMode={permissionMode} theme={theme} onChange={onPermissionModeChange} /> : null}
                        {models?.length && model && onModelChange ? (
                            reasoningEffort && onReasoningEffortChange ? (
                                <AgentModelControls models={models} model={model} reasoningEffort={reasoningEffort} onModelChange={onModelChange} onReasoningEffortChange={onReasoningEffortChange} />
                            ) : (
                                <AgentModelOnlyControl models={models} model={model} onModelChange={onModelChange} />
                            )
                        ) : null}
                        {left}
                    </div>
                    <div className="flex shrink-0 items-center">
                        {sending && onStop ? (
                            <Tooltip title={t("agent.composer.stop")} placement="top">
                                <Button danger shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Square className="size-3.5" />} onClick={() => void onStop()} aria-label={t("agent.composer.stop")} />
                            </Tooltip>
                        ) : (
                            <Tooltip title={t("agent.composer.send")} placement="top">
                                <Button type="primary" shape="circle" className="!h-8 !w-8 !min-w-8" disabled={!canSubmit} icon={sending ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />} onClick={() => void onSubmit()} aria-label={t("agent.composer.send")} />
                            </Tooltip>
                        )}
                    </div>
                </div>
                {hint ? (
                    <div className="mt-1.5 px-1 text-[11px] leading-4" style={{ color: theme.node.muted }}>
                        {hint}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function AgentModelOnlyControl({ models, model, onModelChange }: { models: AgentModel[]; model: string; onModelChange: (model: string) => void }) {
    const { t } = useTranslation();
    const current = models.find((item) => item.model === model) || models[0];
    const [modelOpen, setModelOpen] = useState(false);
    const label = current?.displayName || current?.model || model;
    return (
        <Tooltip title={t("agent.composer.model", { model: label })} placement="top" open={modelOpen ? false : undefined}>
            <span className="inline-flex min-w-0 shrink">
                <Select value={model} open={modelOpen} onOpenChange={setModelOpen} onValueChange={onModelChange}>
                    <SelectTrigger
                        hideChevron
                        className="h-8 max-w-[11rem] min-w-0 justify-start gap-1.5 rounded-lg border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-black/5 focus:ring-0 dark:bg-transparent dark:hover:bg-white/10"
                        aria-label={t("agent.composer.selectModel", { model: label })}
                    >
                        <Cpu className="size-3.5 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                        <ChevronUp className="size-3 shrink-0 opacity-50" />
                    </SelectTrigger>
                    <SelectContent data-canvas-no-zoom position="popper" side="top" align="start" sideOffset={6} className="z-[1200] w-64 rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
                        {models.map((item) => (
                            <SelectItem key={item.model} value={item.model}>
                                {item.displayName || item.model}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </span>
        </Tooltip>
    );
}

function AgentModelControls({ models, model, reasoningEffort, onModelChange, onReasoningEffortChange }: { models: AgentModel[]; model: string; reasoningEffort: AgentReasoningEffort; onModelChange: (model: string) => void; onReasoningEffortChange: (effort: AgentReasoningEffort) => void }) {
    const { t } = useTranslation();
    const current = models.find((item) => item.model === model) || models[0];
    const effortLabel = (effort: AgentReasoningEffort) => t(`agent.composer.effort.${effort}`);
    const [modelOpen, setModelOpen] = useState(false);
    const [reasoningOpen, setReasoningOpen] = useState(false);
    return (
        <div className="flex min-w-0 items-center gap-0.5">
            <Tooltip title={t("agent.composer.model", { model: current.displayName || current.model })} placement="top" open={modelOpen ? false : undefined}>
                <span className="inline-flex min-w-0 shrink">
                    <Select value={model} open={modelOpen} onOpenChange={setModelOpen} onValueChange={onModelChange}>
                        <SelectTrigger
                            hideChevron
                            className="h-8 max-w-[11rem] min-w-0 justify-start gap-1.5 rounded-lg border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-black/5 focus:ring-0 dark:bg-transparent dark:hover:bg-white/10"
                            aria-label={t("agent.composer.selectModel", { model: current.displayName || current.model })}
                        >
                            <Cpu className="size-3.5 shrink-0 opacity-70" />
                            <span className="min-w-0 flex-1 truncate text-left">{current.displayName || current.model}</span>
                            <ChevronUp className="size-3 shrink-0 opacity-50" />
                        </SelectTrigger>
                        <SelectContent data-canvas-no-zoom position="popper" side="top" align="start" sideOffset={6} className="z-[1200] w-64 rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
                            {models.map((item) => <SelectItem key={item.model} value={item.model}>{item.displayName || item.model}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </span>
            </Tooltip>
            <Tooltip title={t("agent.composer.reasoning", { effort: effortLabel(reasoningEffort) })} placement="top" open={reasoningOpen ? false : undefined}>
                <span className="inline-flex shrink-0">
                    <Select value={reasoningEffort} open={reasoningOpen} onOpenChange={setReasoningOpen} onValueChange={(value) => onReasoningEffortChange(value as AgentReasoningEffort)}>
                        <SelectTrigger hideChevron className="h-8 w-8 min-w-8 justify-center gap-0 rounded-lg border-0 bg-transparent px-0 text-xs font-medium shadow-none hover:bg-black/5 focus:ring-0 @min-[660px]:w-auto @min-[660px]:min-w-[4.5rem] @min-[660px]:justify-start @min-[660px]:gap-1.5 @min-[660px]:px-2 dark:bg-transparent dark:hover:bg-white/10" aria-label={t("agent.composer.selectReasoning", { effort: effortLabel(reasoningEffort) })}>
                            <Gauge className="size-3.5 opacity-70" />
                            <span className="hidden @min-[660px]:inline">{effortLabel(reasoningEffort)}</span>
                            <ChevronUp className="hidden size-3 opacity-50 @min-[660px]:block" />
                        </SelectTrigger>
                        <SelectContent data-canvas-no-zoom position="popper" side="top" align="start" sideOffset={6} className="z-[1200] min-w-32 rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
                            {current.supportedReasoningEfforts.map((item) => <SelectItem key={item.reasoningEffort} value={item.reasoningEffort}>{effortLabel(item.reasoningEffort)}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </span>
            </Tooltip>
        </div>
    );
}

function PermissionModeMenu({ permissionMode, theme, onChange }: { permissionMode: AgentPermissionMode; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (permissionMode: AgentPermissionMode) => void }) {
    const { t } = useTranslation();
    const permissionOptions: Array<{ key: AgentPermissionMode; title: string; shortTitle: string; description: string; icon: ReactNode }> = [
        { key: "request", title: t("agent.composer.permission.request"), shortTitle: t("agent.composer.permission.request"), description: t("agent.composer.permission.requestDescription"), icon: <ShieldAlert className="size-3.5" /> },
        { key: "automatic", title: t("agent.composer.permission.automatic"), shortTitle: t("agent.composer.permission.automatic"), description: t("agent.composer.permission.automaticDescription"), icon: <ShieldCheck className="size-3.5" /> },
        { key: "full", title: t("agent.composer.permission.full"), shortTitle: t("agent.composer.permission.fullShort"), description: t("agent.composer.permission.fullDescription"), icon: <ShieldOff className="size-3.5" /> },
    ];
    const current = permissionOptions.find((item) => item.key === permissionMode) || permissionOptions[0];
    const [open, setOpen] = useState(false);
    return (
        <Tooltip title={t("agent.composer.permissionLabel", { mode: current.shortTitle })} placement="top" open={open ? false : undefined}>
            <span className="inline-flex shrink-0">
                <Dropdown
                    trigger={["click"]}
                    placement="topLeft"
                    open={open}
                    onOpenChange={setOpen}
                    menu={{
                        items: permissionOptions.map((item) => ({
                            key: item.key,
                            label: <ConfirmationOption icon={item.icon} title={item.title} description={item.description} selected={permissionMode === item.key} />,
                            onClick: () => onChange(item.key),
                        })),
                    }}
                >
                    <button type="button" className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center gap-0 rounded-lg px-0 text-xs font-medium transition hover:bg-black/5 @min-[660px]:h-8 @min-[660px]:w-auto @min-[660px]:min-w-0 @min-[660px]:justify-start @min-[660px]:gap-1.5 @min-[660px]:px-2 dark:hover:bg-white/10" style={{ color: permissionMode === "full" ? "#ea580c" : theme.node.text }} aria-label={t("agent.composer.selectPermission", { mode: current.title })}>
                        {current.icon}
                        <span className="hidden @min-[660px]:inline">{current.shortTitle}</span>
                        <ChevronUp className="hidden size-3 opacity-50 @min-[660px]:block" />
                    </button>
                </Dropdown>
            </span>
        </Tooltip>
    );
}

function ToolConfirmationMenu({ confirmTools, theme, onChange }: { confirmTools: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (confirmTools: boolean) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const mode = t(confirmTools ? "agent.composer.tools.manual" : "agent.composer.tools.automatic");
    return (
        <Tooltip title={t("agent.composer.tools.label", { mode })} placement="top" open={open ? false : undefined}>
            <span className="inline-flex shrink-0">
                <Dropdown
                    trigger={["click"]}
                    placement="topLeft"
                    open={open}
                    onOpenChange={setOpen}
                    menu={{
                        items: [
                            {
                                key: "manual",
                                label: <ConfirmationOption icon={<Hand className="size-4" />} title={t("agent.composer.tools.manual")} description={t("agent.composer.tools.manualDescription")} selected={confirmTools} />,
                                onClick: () => onChange(true),
                            },
                            {
                                key: "automatic",
                                label: <ConfirmationOption icon={<RefreshCw className="size-4" />} title={t("agent.composer.tools.automatic")} description={t("agent.composer.tools.automaticDescription")} selected={!confirmTools} />,
                                onClick: () => onChange(false),
                            },
                        ],
                    }}
                >
                    <button type="button" className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center gap-0 rounded-lg px-0 text-xs font-medium transition hover:bg-black/5 @min-[660px]:w-auto @min-[660px]:min-w-0 @min-[660px]:justify-start @min-[660px]:gap-1.5 @min-[660px]:px-2 dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label={t("agent.composer.tools.select", { mode })}>
                        {confirmTools ? <Hand className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                        <span className="hidden @min-[660px]:inline">{mode}</span>
                        <ChevronUp className="hidden size-3 opacity-50 @min-[660px]:block" />
                    </button>
                </Dropdown>
            </span>
        </Tooltip>
    );
}

function ConfirmationOption({ icon, title, description, selected }: { icon: ReactNode; title: string; description: string; selected: boolean }) {
    return (
        <div className="flex min-w-64 items-start gap-3 py-1">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-0.5 block text-xs leading-5 opacity-60">{description}</span>
            </span>
            {selected ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
        </div>
    );
}
