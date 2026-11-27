import { App, Button, Form, Input, Modal, Select, Tabs } from "antd";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@canvas/components/model-picker";
import { ChannelEditorDrawer } from "@canvas/components/layout/channel-editor-drawer";
import { ConfigLocalStorage } from "@canvas/components/layout/config-local-storage";
import { ConfigObjectStorage } from "@canvas/components/layout/config-object-storage";
import { ConfigPromptSources } from "@canvas/components/layout/config-prompt-sources";
import { ConfigTtsEngines } from "@canvas/components/layout/config-tts-engines";
import { exportAppConfig, importAppConfig } from "@canvas/services/config-file";
import { audioFormatOptions, normalizeAudioSpeedValue } from "@canvas/lib/audio-generation";
import { hasReadyTtsChannel, listTtsVoices, resolveTtsVoice } from "@canvas/lib/tts-voices";
import {
    createModelChannel,
    modelOptionsFromChannels,
    normalizeModelOptionValue,
    normalizeTtsEngines,
    selectableModelsByCapability,
    ttsVendorMeta,
    useConfigStore,
    type AiConfig,
    type ConfigTabKey,
    type ModelCapability,
    type ModelChannel,
} from "@canvas/stores/use-config-store";
type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    labelKey: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", labelKey: "config.preferences.defaultImageModel" },
    { capability: "video", modelKey: "videoModel", labelKey: "config.preferences.defaultVideoModel" },
    { capability: "text", modelKey: "textModel", labelKey: "config.preferences.defaultTextModel" },
    { capability: "audio", modelKey: "audioModel", labelKey: "config.preferences.defaultAudioModel" },
];


export function AppConfigPanel({ showDoneButton = false, initialTab = "channels" }: { showDoneButton?: boolean; initialTab?: ConfigTabKey }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const configInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<ConfigTabKey>(initialTab);
    const [editingChannelId, setEditingChannelId] = useState("");
    /** Draft channel for "Add" flow — not written to store until the user saves. */
    const [draftChannel, setDraftChannel] = useState<ModelChannel | null>(null);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const editingChannel =
        draftChannel && draftChannel.id === editingChannelId
            ? draftChannel
            : config.channels.find((channel) => channel.id === editingChannelId) || null;
    useEffect(() => {
        setActiveTab(initialTab === "webdav" ? "channels" : initialTab);
    }, [initialTab]);

    const saveConfig = (nextConfig: AiConfig) => {
        (Object.keys(nextConfig) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, nextConfig[key]));
    };

    const finishConfig = () => {
        const ready = config.channels.some((channel) => channel.baseUrl.trim() && channel.apiKey.trim() && channel.models.length);
        setConfigDialogOpen(false);
        if (!ready) return;
        message.success(t(shouldPromptContinue ? "config.savedContinue" : "config.saved"));
        clearPromptContinue();
    };

    const loadConfigFile = async (file: File) => {
        try {
            await importAppConfig(file);
            message.success(t("config.imported"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.importFailed"));
        } finally {
            if (configInputRef.current) configInputRef.current.value = "";
        }
    };

    const updateChannels = (channels: ModelChannel[]) => saveConfig(withChannels(config, channels));

    const closeChannelEditor = () => {
        setEditingChannelId("");
        setDraftChannel(null);
    };

    const saveChannel = (channel: ModelChannel) => {
        const exists = config.channels.some((item) => item.id === channel.id);
        updateChannels(
            exists
                ? config.channels.map((item) => (item.id === channel.id ? channel : item))
                : [...config.channels, channel],
        );
        closeChannelEditor();
    };

    const addChannel = () => {
        const channel = createModelChannel({
            name: t("config.channels.numberedName", { count: config.channels.length + 1 }),
        });
        setDraftChannel(channel);
        setEditingChannelId(channel.id);
    };

    const removeChannel = (id: string) => {
        if (config.channels.length <= 1) {
            message.warning(t("config.channels.keepOne"));
            return;
        }
        updateChannels(config.channels.filter((channel) => channel.id !== id));
        if (editingChannelId === id) closeChannelEditor();
    };

    return (
        <>
            <div className="flex flex-wrap items-center justify-end gap-3 border-b border-stone-200 pb-3 dark:border-stone-800">
                <div className="flex gap-2">
                    <Button icon={<Upload className="size-4" />} onClick={() => configInputRef.current?.click()}>
                        {t("config.import")}
                    </Button>
                    <Button icon={<Download className="size-4" />} onClick={exportAppConfig}>
                        {t("config.export")}
                    </Button>
                    <input ref={configInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => event.target.files?.[0] && void loadConfigFile(event.target.files[0])} />
                </div>
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as ConfigTabKey)}
                items={[
                    {
                        key: "channels",
                        label: <span data-tour="config-tab-channels">{t("config.tabs.channels")}</span>,
                        children: (
                            <div data-tour="config-channels-panel">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-stone-500">{t("config.channels.description")}</div>
                                    <Button type="primary" icon={<Plus className="size-3.5" />} onClick={addChannel}>
                                        {t("config.channels.add")}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {config.channels.map((channel) => (
                                        <div
                                            key={channel.id}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                                                    {channel.name.trim() || t("config.channels.unnamed")}
                                                </div>
                                                <div className="mt-0.5 truncate text-xs text-stone-500">
                                                    {channel.baseUrl.trim() || t("config.channels.missingUrl")}
                                                    {" · "}
                                                    {t(channel.apiKey?.trim() ? "config.channels.apiKeyReady" : "config.channels.apiKeyMissing")}
                                                    {" · "}
                                                    {t("config.channels.modelCount", { count: channel.models.length })}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    size="small"
                                                    icon={<Pencil className="size-3.5" />}
                                                    data-tour="config-channel-edit"
                                                    onClick={() => setEditingChannelId(channel.id)}
                                                >
                                                    {t("common.edit")}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    danger
                                                    type="text"
                                                    icon={<Trash2 className="size-3.5" />}
                                                    aria-label={t("common.delete")}
                                                    onClick={() => removeChannel(channel.id)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "preferences",
                        label: <span data-tour="config-tab-preferences">{t("config.tabs.preferences")}</span>,
                        children: (
                            <div data-tour="config-preferences-panel">
                            <Form layout="vertical" requiredMark={false}>
                                <div className="mb-2 text-sm font-semibold">{t("config.preferences.defaultModels")}</div>
                                <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                    {modelGroups.map((group) => (
                                        <Form.Item key={group.modelKey} label={t(group.labelKey)} className="mb-0">
                                            <ModelPicker config={config} value={config[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth />
                                        </Form.Item>
                                    ))}
                                </div>
                                <div className="mb-2 text-sm font-semibold">{t("config.preferences.generation")}</div>
                                <div className="grid gap-4 md:grid-cols-4">
                                    <Form.Item label={t("config.preferences.canvasImageCount")} extra={t("config.preferences.canvasImageCountDescription")} className="mb-4">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={15}
                                            value={config.canvasImageCount}
                                            onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                            onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                                        />
                                    </Form.Item>
                                    <Form.Item label={t("config.preferences.audioVoice")} extra={t("config.preferences.audioVoiceHint")} className="mb-4 md:col-span-2">
                                        <Select
                                            showSearch
                                            allowClear={false}
                                            optionFilterProp="search"
                                            value={resolveTtsVoice(config.ttsVoiceId)?.id || config.ttsVoiceId}
                                            options={listTtsVoices().map((voice) => {
                                                const ready = hasReadyTtsChannel(config.ttsEngines, voice.vendor);
                                                const vendorLabel = t(ttsVendorMeta(voice.vendor).labelKey);
                                                const desc = voice.description ? ` · ${voice.description}` : "";
                                                return {
                                                    value: voice.id,
                                                    label: `${voice.name}${desc} · ${vendorLabel}${ready ? "" : ` (${t("config.tts.noChannel")})`}`,
                                                    disabled: !ready,
                                                    search: `${voice.name} ${voice.description} ${vendorLabel} ${voice.upstreamId}`,
                                                };
                                            })}
                                            onChange={(value) => {
                                                const upstream = value.includes(":") ? value.slice(value.indexOf(":") + 1) : value;
                                                updateConfig("ttsVoiceId", value);
                                                updateConfig("audioVoice", upstream);
                                            }}
                                        />
                                    </Form.Item>
                                    <Form.Item label={t("config.preferences.audioFormat")} className="mb-4">
                                        <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                                    </Form.Item>
                                    <Form.Item label={t("config.preferences.audioSpeed")} className="mb-4">
                                        <Input
                                            type="number"
                                            min={0.25}
                                            max={4}
                                            step={0.05}
                                            value={config.audioSpeed}
                                            onChange={(event) => updateConfig("audioSpeed", event.target.value)}
                                            onBlur={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                                        />
                                    </Form.Item>
                                </div>
                                <Form.Item label={t("config.preferences.audioInstructions")} className="mb-4">
                                    <Input.TextArea rows={2} value={config.audioInstructions} placeholder={t("config.preferences.audioInstructionsPlaceholder")} onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                                </Form.Item>
                                <Form.Item label={t("config.preferences.systemPrompt")} className="mb-0">
                                    <Input.TextArea rows={4} value={config.systemPrompt} placeholder={t("config.preferences.systemPromptPlaceholder")} onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                                </Form.Item>
                            </Form>
                            </div>
                        ),
                    },
                    {
                        key: "tts",
                        label: <span data-tour="config-tab-tts">{t("config.tabs.tts")}</span>,
                        children: (
                            <ConfigTtsEngines
                                engines={normalizeTtsEngines(config.ttsEngines)}
                                onChange={(ttsEngines) => updateConfig("ttsEngines", ttsEngines)}
                            />
                        ),
                    },
                    {
                        key: "prompt-sources",
                        label: t("config.tabs.promptSources"),
                        children: <ConfigPromptSources />,
                    },
                    {
                        key: "local-storage",
                        label: t("config.tabs.localStorage"),
                        children: <ConfigLocalStorage active={activeTab === "local-storage"} />,
                    },
                    {
                        key: "object-storage",
                        label: t("config.tabs.objectStorage"),
                        children: <ConfigObjectStorage />,
                    },
                ]}
            />
            {showDoneButton ? (
                <div className="mt-4 flex justify-end">
                    <Button type="primary" onClick={finishConfig}>
                        {t("common.done")}
                    </Button>
                </div>
            ) : null}
            <ChannelEditorDrawer
                open={Boolean(editingChannel)}
                channel={editingChannel}
                onSave={saveChannel}
                onClose={closeChannelEditor}
            />
        </>
    );
}

export function AppConfigModal() {
    const { t } = useTranslation();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const configTab = useConfigStore((state) => state.configTab);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">{t("config.title")}</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">{t("config.modalDescription")}</div>
                </div>
            }
            open={isConfigOpen}
            width={980}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 12 } }}
            footer={null}
        >
            <AppConfigPanel showDoneButton initialTab={configTab} />
        </Modal>
    );
}

function withChannels(config: AiConfig, channels: ModelChannel[]): AiConfig {
    const next: AiConfig = {
        ...config,
        channels,
        models: modelOptionsFromChannels(channels),
        baseUrl: channels[0]?.baseUrl || config.baseUrl,
        apiKey: channels[0]?.apiKey || config.apiKey,
        apiFormat: channels[0]?.apiFormat || config.apiFormat,
    };
    return {
        ...next,
        imageModel: pickDefaultModel(next, "image", config.imageModel),
        videoModel: pickDefaultModel(next, "video", config.videoModel),
        textModel: pickDefaultModel(next, "text", config.textModel),
        audioModel: pickDefaultModel(next, "audio", config.audioModel),
    };
}

function pickDefaultModel(config: AiConfig, capability: ModelCapability, current: string) {
    const options = selectableModelsByCapability(config, capability);
    const normalized = normalizeModelOptionValue(current, config.channels);
    return options.includes(normalized) ? normalized : options[0] || "";
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
