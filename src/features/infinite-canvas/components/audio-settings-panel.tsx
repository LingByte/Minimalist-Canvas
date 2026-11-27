import { Select } from "antd";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@canvas/components/image-settings-panel";
import { audioFormatOptions, audioSpeedLabel, normalizeAudioFormatValue, normalizeAudioSpeedValue } from "@canvas/lib/audio-generation";
import { type CanvasTheme } from "@canvas/lib/canvas-theme";
import { hasReadyTtsChannel, listTtsVoices, resolveTtsVoice } from "@canvas/lib/tts-voices";
import { ttsVendorMeta, type AiConfig } from "@canvas/stores/use-config-store";

const speedOptions = ["0.75", "1", "1.25", "1.5"];

type AudioSettingKey = "ttsVoiceId" | "audioFormat" | "audioSpeed" | "audioInstructions";

type AudioSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: AudioSettingKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: AudioSettingsPanelProps) {
    const { t } = useTranslation();
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);
    const selected = resolveTtsVoice(config.ttsVoiceId);
    const voiceOptions = useMemo(
        () =>
            listTtsVoices().map((voice) => {
                const ready = hasReadyTtsChannel(config.ttsEngines, voice.vendor);
                const vendorLabel = t(ttsVendorMeta(voice.vendor).labelKey);
                const desc = voice.description ? ` · ${voice.description}` : "";
                return {
                    value: voice.id,
                    label: `${voice.name}${desc} · ${vendorLabel}${ready ? "" : ` (${t("config.tts.noChannel")})`}`,
                    disabled: !ready,
                    search: `${voice.name} ${voice.description} ${vendorLabel} ${voice.upstreamId} ${voice.locale || ""} ${voice.category || ""}`,
                };
            }),
        [config.ttsEngines, t],
    );

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">{t("settingsPanels.audio.title")}</div> : null}
                <SettingGroup title={t("settingsPanels.audio.voice")} color={theme.node.muted}>
                    <Select
                        className="w-full"
                        showSearch
                        optionFilterProp="search"
                        value={selected?.id || config.ttsVoiceId || undefined}
                        placeholder={t("settingsPanels.audio.voiceSearch")}
                        options={voiceOptions}
                        onChange={(value) => onConfigChange("ttsVoiceId", value)}
                        onMouseDown={(event) => event.stopPropagation()}
                        popupMatchSelectWidth={false}
                        listHeight={280}
                    />
                    {selected && !hasReadyTtsChannel(config.ttsEngines, selected.vendor) ? (
                        <div className="text-xs opacity-70">{t("config.tts.noChannelHint", { vendor: t(ttsVendorMeta(selected.vendor).labelKey) })}</div>
                    ) : null}
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.audio.format")} color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {audioFormatOptions.map((item) => (
                            <OptionPill key={item.value} selected={format === item.value} theme={theme} onClick={() => onConfigChange("audioFormat", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.audio.speed")} color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {speedOptions.map((value) => (
                            <OptionPill key={value} selected={speed === value} theme={theme} onClick={() => onConfigChange("audioSpeed", value)}>
                                {audioSpeedLabel(value)}
                            </OptionPill>
                        ))}
                    </div>
                    <input
                        type="number"
                        min={0.25}
                        max={4}
                        step={0.05}
                        className="h-9 w-full rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                        value={config.audioSpeed || "1"}
                        onChange={(event) => onConfigChange("audioSpeed", event.target.value)}
                        onBlur={(event) => onConfigChange("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
                <SettingGroup title={t("settingsPanels.audio.instructions")} color={theme.node.muted}>
                    <textarea
                        value={config.audioInstructions || ""}
                        placeholder={t("settingsPanels.audio.instructionsPlaceholder")}
                        className="thin-scrollbar h-20 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onChange={(event) => onConfigChange("audioInstructions", event.target.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}
