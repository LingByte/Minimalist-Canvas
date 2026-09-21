import { Button, Drawer, Input, Select, Space } from "antd";
import { ListPlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { defaultBaseUrlForApiFormat, guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@canvas/stores/use-config-store";
import { useConfigOnboardingStore } from "@canvas/stores/use-config-onboarding-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const tourActive = useConfigOnboardingStore((state) => state.active);
    const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
    ];
    const capabilityOptions: Array<{ label: string; value: ModelCapability }> = ["image", "video", "text", "audio"].map((value) => ({
        label: t(`config.channelEditor.capabilities.${value}`),
        value: value as ModelCapability,
    }));

    useEffect(() => {
        if (open && channel) setDraft(channel);
    }, [open, channel]);

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => (current ? { ...current, ...value } : current));
    const setModels = (models: ChannelModel[]) => patch({ models });

    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        const baseUrl = !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        patch({ apiFormat, baseUrl });
    };

    const applySelection = (items: Array<{ name: string; capability?: ModelCapability; description?: string }>) => {
        const map = new Map(draft.models.map((model) => [model.name, model]));
        setModels(
            items.map(({ name, capability, description }) => {
                const previous = map.get(name);
                if (previous) {
                    return {
                        ...previous,
                        capability: capability || previous.capability,
                        description: description?.trim() || previous.description,
                    };
                }
                return {
                    name,
                    capability: capability || guessCapability(name),
                    description: description?.trim() || undefined,
                };
            }),
        );
    };

    const setCapability = (name: string, capability: ModelCapability) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capability } : model)));
    const setScript = (name: string, script: string) => setModels(draft.models.map((model) => (model.name === name ? { ...model, script: script || undefined } : model)));
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));

    const save = () => {
        onSave({ ...draft, name: draft.name.trim() || t("config.channels.unnamed"), models: normalizeChannelModels(draft.models) });
        onClose();
    };

    return (
        <Drawer
            open={open}
            size={860}
            title={t("config.channelEditor.title")}
            onClose={onClose}
            mask={!tourActive}
            zIndex={tourActive ? 10080 : undefined}
            styles={{ body: { paddingTop: 16, displayBottom: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" onClick={save}>
                        {t("common.save")}
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block sm:col-span-2" data-tour="config-channel-base-url">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
                    <Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                </label>
                <label className="block sm:col-span-2" data-tour="config-channel-api-key">
                    <span className="mb-1 block text-sm font-medium">API Key</span>
                    <Input.Password value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." />
                </label>
            </div>

            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{t("config.channelEditor.models")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t("config.channelEditor.modelDescription", { count: draft.models.length })}</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>
                    {t("config.channelEditor.selectModels")}
                </Button>
            </div>

            <div className="thin-scrollbar max-h-[min(52vh,520px)] space-y-2 overflow-y-auto rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="rounded-md border border-stone-100 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-950/40">
                            <div className="min-w-0" title={model.description ? `${model.name} — ${model.description}` : model.name}>
                                <div className="break-all text-sm font-medium leading-5 text-stone-900 dark:text-stone-100">{model.name}</div>
                                {model.description ? <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-stone-400">{model.description}</div> : null}
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                <Select
                                    size="small"
                                    className="min-w-[7.5rem]"
                                    value={model.capability}
                                    options={capabilityOptions}
                                    onChange={(value) => setCapability(model.name, value)}
                                    popupMatchSelectWidth={false}
                                />
                                <Button
                                    size="small"
                                    type={model.script ? "primary" : "default"}
                                    ghost={Boolean(model.script)}
                                    onClick={() => setScriptTarget({ name: model.name, capability: model.capability, value: model.script || "" })}
                                >
                                    {t(model.script ? "config.channelEditor.scriptReady" : "config.channelEditor.script")}
                                </Button>
                                <Button size="small" danger type="text" className="!ml-auto" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">{t("config.channelEditor.empty")}</div>
                )}
            </div>

            <ModelSelectModal open={selectOpen} channel={draft} selectedNames={draft.models.map((model) => model.name)} onConfirm={applySelection} onClose={() => setSelectOpen(false)} />

            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}
