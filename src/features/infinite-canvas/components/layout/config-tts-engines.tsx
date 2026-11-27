import { App, Button, Input, Select, Space } from "antd";
import { Pencil, Plus, Trash2, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
    TTS_VENDOR_META,
    createTtsEngine,
    isTtsEngineReady,
    ttsVendorMeta,
    type TtsEngine,
    type TtsFieldKey,
    type TtsVendor,
} from "@canvas/lib/tts-engines";
import { defaultVoiceForVendor } from "@canvas/lib/tts-voices";
import { synthesizeSpeech } from "@canvas/services/api/tts";

export function ConfigTtsEngines({
    engines,
    onChange,
}: {
    engines: TtsEngine[];
    onChange: (engines: TtsEngine[]) => void;
}) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const editing = useMemo(() => engines.find((engine) => engine.id === editingId) || null, [engines, editingId]);

    const vendorOptions = TTS_VENDOR_META.map((meta) => ({
        value: meta.vendor,
        label: t(meta.labelKey),
    }));

    useEffect(() => {
        return () => {
            stopPreviewAudio(audioRef, objectUrlRef);
        };
    }, []);

    const addEngine = () => {
        const engine = createTtsEngine({
            vendor: "openai",
            name: t("config.tts.numberedName", { count: engines.length + 1 }),
        });
        onChange([...engines, engine]);
        setEditingId(engine.id);
    };

    const saveEngine = (next: TtsEngine) => {
        onChange(engines.map((engine) => (engine.id === next.id ? next : engine)));
        setEditingId(null);
    };

    const removeEngine = (id: string) => {
        const next = engines.filter((engine) => engine.id !== id);
        onChange(next);
        if (editingId === id) setEditingId(null);
    };

    const runTest = async (engine: TtsEngine) => {
        if (testingId) return;
        if (!isTtsEngineReady(engine)) {
            message.warning(t("config.tts.testIncomplete"));
            return;
        }
        setTestingId(engine.id);
        try {
            const catalogVoice = defaultVoiceForVendor(engine.vendor);
            const upstream = catalogVoice?.upstreamId || engine.voice || "alloy";
            const hydrated = catalogVoice
                ? { ...engine, voice: upstream, options: { ...engine.options, ...(engine.vendor === "qcloud" || engine.vendor === "volcengine" || engine.vendor === "qiniu" ? { voiceType: upstream } : engine.vendor === "elevenlabs" || engine.vendor === "fishaudio" || engine.vendor === "minimax" ? { voiceId: upstream } : engine.vendor === "xunfei" ? { vcn: upstream } : engine.vendor === "fishspeech" || engine.vendor === "coqui" ? { speaker: upstream } : {}) } }
                : engine;
            const result = await synthesizeSpeech(hydrated, {
                text: t("config.tts.testPhrase"),
                voice: upstream,
                format: "mp3",
                speed: 1,
            });
            await playPreviewAudio(result.blob, audioRef, objectUrlRef);
            message.success(t("config.tts.testOk"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.tts.testFailed"));
        } finally {
            setTestingId(null);
        }
    };

    return (
        <div className="space-y-4" data-tour="config-tts-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{t("config.tts.title")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t("config.tts.description")}</div>
                </div>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={addEngine}>
                    {t("config.tts.add")}
                </Button>
            </div>

            {engines.length ? null : (
                <div className="rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 dark:border-stone-700">
                    {t("config.tts.empty")}
                </div>
            )}

            <div className="space-y-2">
                {engines.map((engine) => (
                    <div
                        key={engine.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2.5 dark:border-stone-800"
                    >
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{engine.name}</div>
                            <div className="mt-0.5 text-xs text-stone-500">
                                {t(ttsVendorMeta(engine.vendor).labelKey)}
                                {" · "}
                                {isTtsEngineReady(engine) ? t("config.tts.ready") : t("config.tts.incomplete")}
                            </div>
                        </div>
                        <Space wrap>
                            <Button
                                size="small"
                                icon={<Volume2 className="size-3.5" />}
                                loading={testingId === engine.id}
                                disabled={Boolean(testingId) && testingId !== engine.id}
                                onClick={() => void runTest(engine)}
                            >
                                {testingId === engine.id ? t("config.tts.testing") : t("config.tts.test")}
                            </Button>
                            <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditingId(engine.id)}>
                                {t("common.edit")}
                            </Button>
                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removeEngine(engine.id)} />
                        </Space>
                    </div>
                ))}
            </div>

            {editing ? (
                <TtsEngineEditor
                    engine={editing}
                    vendorOptions={vendorOptions}
                    testing={testingId === editing.id}
                    testDisabled={Boolean(testingId) && testingId !== editing.id}
                    onCancel={() => setEditingId(null)}
                    onSave={saveEngine}
                    onTest={(draft) => void runTest(draft)}
                />
            ) : null}
        </div>
    );
}

function TtsEngineEditor({
    engine,
    vendorOptions,
    testing,
    testDisabled,
    onCancel,
    onSave,
    onTest,
}: {
    engine: TtsEngine;
    vendorOptions: Array<{ value: TtsVendor; label: string }>;
    testing: boolean;
    testDisabled: boolean;
    onCancel: () => void;
    onSave: (engine: TtsEngine) => void;
    onTest: (engine: TtsEngine) => void;
}) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<TtsEngine>(engine);
    const meta = ttsVendorMeta(draft.vendor);

    const patch = (value: Partial<TtsEngine>) => setDraft((current) => ({ ...current, ...value }));
    const patchOption = (key: string, value: string) =>
        setDraft((current) => ({ ...current, options: { ...current.options, [key]: value } }));

    const setVendor = (vendor: TtsVendor) => {
        const next = createTtsEngine({
            ...draft,
            vendor,
            name: draft.name,
            id: draft.id,
        });
        setDraft(next);
    };

    return (
        <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="mb-3 text-sm font-semibold">{t("config.tts.editTitle")}</div>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.tts.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.tts.vendor")}</span>
                    <Select className="w-full" value={draft.vendor} options={vendorOptions} onChange={setVendor} />
                </label>
                {meta.fields.map((field) => (
                    <TtsFieldInput key={field} field={field} engine={draft} onPatch={patch} onPatchOption={patchOption} />
                ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button icon={<Volume2 className="size-3.5" />} loading={testing} disabled={testDisabled} onClick={() => onTest(draft)}>
                    {testing ? t("config.tts.testing") : t("config.tts.test")}
                </Button>
                <Button onClick={onCancel}>{t("common.cancel")}</Button>
                <Button type="primary" onClick={() => onSave({ ...draft, name: draft.name.trim() || t("config.tts.defaultName", { vendor: t(meta.labelKey) }) })}>
                    {t("common.save")}
                </Button>
            </div>
        </div>
    );
}

function TtsFieldInput({
    field,
    engine,
    onPatch,
    onPatchOption,
}: {
    field: TtsFieldKey;
    engine: TtsEngine;
    onPatch: (value: Partial<TtsEngine>) => void;
    onPatchOption: (key: string, value: string) => void;
}) {
    const { t } = useTranslation();
    const label = t(`config.tts.fields.${field}`);
    const isSecret = field === "apiKey" || field === "apiSecret" || field === "secretKey" || field === "secretAccessKey" || field === "accessToken";

    if (field === "apiKey") {
        return (
            <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium">{label}</span>
                <Input.Password value={engine.apiKey} onChange={(event) => onPatch({ apiKey: event.target.value })} />
            </label>
        );
    }
    if (field === "baseUrl") {
        return (
            <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium">{label}</span>
                <Input value={engine.baseUrl} onChange={(event) => onPatch({ baseUrl: event.target.value })} placeholder="https://" />
            </label>
        );
    }
    if (field === "model") {
        return (
            <label className="block">
                <span className="mb-1 block text-sm font-medium">{label}</span>
                <Input value={engine.model} onChange={(event) => onPatch({ model: event.target.value })} />
            </label>
        );
    }

    const optionKey = field;
    const value = engine.options[optionKey] || "";
    return (
        <label className="block">
            <span className="mb-1 block text-sm font-medium">{label}</span>
            {isSecret ? (
                <Input.Password value={value} onChange={(event) => onPatchOption(optionKey, event.target.value)} />
            ) : (
                <Input value={value} onChange={(event) => onPatchOption(optionKey, event.target.value)} />
            )}
        </label>
    );
}

function stopPreviewAudio(
    audioRef: { current: HTMLAudioElement | null },
    objectUrlRef: { current: string | null },
) {
    const audio = audioRef.current;
    if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audioRef.current = null;
    }
    if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
    }
}

async function playPreviewAudio(
    blob: Blob,
    audioRef: { current: HTMLAudioElement | null },
    objectUrlRef: { current: string | null },
) {
    stopPreviewAudio(audioRef, objectUrlRef);
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
        if (objectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            objectUrlRef.current = null;
            audioRef.current = null;
        }
    };
    await audio.play();
}
