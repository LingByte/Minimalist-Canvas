import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, Maximize2, Sparkles } from "lucide-react";
import { App, Button, Modal, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@canvas/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@canvas/stores/use-config-store";
import { canvasThemes } from "@canvas/lib/canvas-theme";
import { useThemeStore } from "@canvas/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { optimizeCanvasPrompt, type OptimizablePromptMode } from "@canvas/services/prompt-optimizer";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@canvas/types/canvas";
import type { CanvasResourceReference } from "@canvas/lib/canvas/canvas-resource-references";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onConnectResource?: (reference: CanvasResourceReference) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode; // Plugin nodes set their generation type through useBuiltinPanel.mode.
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, mentionReferences = [], onConnectResource, onImageSettingsOpenChange, modeOverride }: CanvasNodePromptPanelProps) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    const [optimizing, setOptimizing] = useState(false);
    const [optimizePreview, setOptimizePreview] = useState<{ draft: string; text: string; done: boolean } | null>(null);
    const optimizeAbortRef = useRef<AbortController | null>(null);

    useEffect(() => () => optimizeAbortRef.current?.abort(), []);

    // Restore prompts only when switching nodes; preserve the current input after generation on the same node.
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (isEditingExistingContent) onConfigChange(node.id, { composerContent: value });
        else onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
    };

    const openExpandedEditor = () => {
        setExpanded(true);
    };

    const optimizable = mode === "image" || mode === "video" || mode === "audio";

    const optimize = async () => {
        const draft = prompt.trim();
        if (!draft || optimizing) return;
        const controller = new AbortController();
        optimizeAbortRef.current = controller;
        setOptimizing(true);
        setOptimizePreview({ draft, text: "", done: false });
        try {
            const optimized = await optimizeCanvasPrompt(
                globalConfig,
                {
                    mode: mode as OptimizablePromptMode,
                    draft,
                    seconds: mode === "video" ? Number(config.videoSeconds) || undefined : undefined,
                    references: mentionReferences,
                },
                (text) => setOptimizePreview((current) => (current ? { ...current, text } : current)),
                { signal: controller.signal },
            );
            if (!optimized) throw new Error(t("canvas.promptPanel.optimizeFailed"));
            setOptimizePreview((current) => (current ? { ...current, text: optimized, done: true } : current));
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : t("canvas.promptPanel.optimizeFailed"));
            setOptimizePreview(null);
        } finally {
            optimizeAbortRef.current = null;
            setOptimizing(false);
        }
    };

    const closeOptimizePreview = () => {
        optimizeAbortRef.current?.abort();
        optimizeAbortRef.current = null;
        setOptimizePreview(null);
        setOptimizing(false);
    };

    const applyOptimized = () => {
        const text = optimizePreview?.text.trim();
        if (!text) return;
        updatePrompt(text);
        setOptimizePreview(null);
    };

    const optimizeDisabled = optimizing || isRunning || !prompt.trim();
    const optimizeTip = optimizing
        ? t("canvas.promptPanel.optimizing")
        : isRunning
            ? t("canvas.promptPanel.optimizeWhileRunning")
            : !prompt.trim()
                ? t("canvas.promptPanel.optimizeNeedsPrompt")
                : t("canvas.promptPanel.optimizePrompt");

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <CanvasPromptChipInput
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onConnectResource={onConnectResource}
                className="thin-scrollbar h-40 w-full cursor-text resize-none rounded-xl px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: "transparent", color: theme.node.text }}
                placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                        <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={<Maximize2 className="size-3.5" />} onClick={openExpandedEditor} aria-label={t("canvas.promptPanel.expandEditor")} />
                    </Tooltip>
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {optimizable ? (
                        <Tooltip title={optimizeTip}>
                            <span>
                                <Button
                                    type="text"
                                    className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0"
                                    style={{ color: theme.node.text }}
                                    icon={optimizing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                                    disabled={optimizeDisabled}
                                    onClick={() => void optimize()}
                                    aria-label={optimizeTip}
                                />
                            </span>
                        </Tooltip>
                    ) : null}
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasTextSettingsPopover config={config} count={node.metadata?.textCount || 1} onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })} onCountChange={(textCount) => onConfigChange(node.id, { textCount })} />
                        </>
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    disabled={isRunning || !prompt.trim()}
                    onClick={() => {
                        if (!isRunning) submit();
                    }}
                    aria-label={t(isRunning ? "canvas.node.generating" : "canvas.promptPanel.generate")}
                >
                    {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </Button>
            </div>
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    <CanvasPromptChipInput
                        value={prompt}
                        references={mentionReferences}
                        onChange={updatePrompt}
                        onConnectResource={onConnectResource}
                        className="thin-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-xl border p-4 text-[15px] leading-6 outline-none"
                        style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
                    />
                </div>
            </Modal>
            <Modal
                title={t("canvas.promptPanel.optimizeTitle")}
                open={Boolean(optimizePreview)}
                centered
                width={860}
                footer={[
                    <Button key="cancel" onClick={closeOptimizePreview}>
                        {t("common.cancel")}
                    </Button>,
                    <Button key="apply" type="primary" disabled={!optimizePreview?.done || !optimizePreview.text.trim()} onClick={applyOptimized}>
                        {t("canvas.promptPanel.optimizeApply")}
                    </Button>,
                ]}
                onCancel={closeOptimizePreview}
                destroyOnHidden
            >
                <div className="flex gap-3 pt-2">
                    <div className="min-w-0 flex-1">
                        <div className="pb-1 text-xs font-medium uppercase tracking-wide opacity-60">{t("canvas.promptPanel.optimizeOriginal")}</div>
                        <div className="thin-scrollbar max-h-[55dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border p-3 text-sm leading-6 opacity-70" style={{ borderColor: theme.toolbar.border }}>
                            {optimizePreview?.draft}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 pb-1 text-xs font-medium uppercase tracking-wide opacity-60">
                            {t("canvas.promptPanel.optimizeResult")}
                            {!optimizePreview?.done ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                        </div>
                        <div className="thin-scrollbar max-h-[55dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border p-3 text-sm leading-6" style={{ borderColor: theme.toolbar.border }}>
                            {optimizePreview?.text || "…"}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    return {
        ...globalConfig,
        model: resolveModelForCapability(globalConfig, node.metadata?.model, mode),
        reasoningEffort: node.metadata?.reasoningEffort || globalConfig.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        imageResolution: node.metadata?.imageResolution || globalConfig.imageResolution || defaultConfig.imageResolution,
        background: node.metadata?.background ?? globalConfig.background ?? defaultConfig.background,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
