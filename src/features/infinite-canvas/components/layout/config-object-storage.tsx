import { App, Button, Input, Select, Switch, Tooltip } from "antd";
import { CircleHelp, CloudUpload, PlugZap } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { testObjectStorageConnection } from "@canvas/lib/object-storage/client";
import {
    OBJECT_STORAGE_PROVIDER_META,
    normalizeKodoEndpoint,
    resolveForcePathStyle,
    resolveObjectStorageEndpoint,
} from "@canvas/lib/object-storage/providers";
import {
    OBJECT_STORAGE_PROVIDERS,
    defaultObjectStorageConfig,
    isObjectStorageConfigured,
    type ObjectStorageConfig,
    type ObjectStorageProvider,
} from "@canvas/lib/object-storage/types";
import { invalidateObjectStorageStatusCache } from "@canvas/services/object-storage";
import { useConfigStore } from "@canvas/stores/use-config-store";

export function ConfigObjectStorage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.objectStorage);
    const setObjectStorageConfig = useConfigStore((state) => state.setObjectStorageConfig);
    const updateObjectStorageConfig = useConfigStore((state) => state.updateObjectStorageConfig);
    const [testing, setTesting] = useState(false);

    const providerMeta = OBJECT_STORAGE_PROVIDER_META[config.provider];
    const resolvedEndpoint = useMemo(() => resolveObjectStorageEndpoint(config), [config]);
    const pathStyle = resolveForcePathStyle(config);

    const persist = (next: ObjectStorageConfig) => {
        setObjectStorageConfig(next);
        invalidateObjectStorageStatusCache();
    };

    const patch = <K extends keyof ObjectStorageConfig>(key: K, value: ObjectStorageConfig[K]) => {
        updateObjectStorageConfig(key, value);
        invalidateObjectStorageStatusCache();
    };

    const onProviderChange = (provider: ObjectStorageProvider) => {
        persist({
            ...config,
            provider,
            forcePathStyle: null,
            pathPrefix: config.pathPrefix || defaultObjectStorageConfig.pathPrefix,
        });
    };

    const commitTrimmed = <K extends keyof ObjectStorageConfig>(key: K, value: string) => {
        const trimmed = value.trim();
        if (key === "publicBaseUrl") {
            patch(key, trimmed.replace(/\/+$/, "") as ObjectStorageConfig[K]);
            return;
        }
        if (key === "pathPrefix") {
            patch(key, (trimmed || "canvas/") as ObjectStorageConfig[K]);
            return;
        }
        if (key === "endpoint" && config.provider === "kodo") {
            patch(key, normalizeKodoEndpoint(trimmed, config.region) as ObjectStorageConfig[K]);
            return;
        }
        patch(key, trimmed as ObjectStorageConfig[K]);
    };

    const testConnection = async () => {
        if (testing) return;
        if (!config.enabled) {
            message.warning(t("config.objectStorage.enableFirst"));
            return;
        }
        if (!isObjectStorageConfigured(config)) {
            message.warning(t("config.objectStorage.incomplete"));
            return;
        }
        setTesting(true);
        try {
            const result = await testObjectStorageConnection(config);
            message.success(t("config.objectStorage.testOk", { url: result.accessUrl }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.objectStorage.testFailed"));
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                            <CloudUpload className="size-4 shrink-0" />
                            <span>{t("config.objectStorage.title")}</span>
                            <Tooltip
                                title={
                                    <div className="space-y-1.5 text-xs leading-relaxed">
                                        <div className="font-medium">{t("config.objectStorage.hintTitle")}</div>
                                        <div>{t("config.objectStorage.hintBody")}</div>
                                    </div>
                                }
                                styles={{ root: { maxWidth: 360 } }}
                            >
                                <button
                                    type="button"
                                    className="inline-flex size-5 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                                    aria-label={t("config.objectStorage.hintTitle")}
                                >
                                    <CircleHelp className="size-3.5" />
                                </button>
                            </Tooltip>
                        </div>
                        <div className="mt-1 text-xs text-stone-500">{t("config.objectStorage.description")}</div>
                        <div className="mt-1 text-[11px] text-stone-400">{t("config.objectStorage.autoSaved")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">{t("config.objectStorage.enabled")}</span>
                        <Switch checked={config.enabled} onChange={(checked) => patch("enabled", checked)} />
                    </div>
                </div>

                <div className={`mt-3 ${config.enabled ? "" : "opacity-60"}`}>
                    <div className="grid gap-x-3 gap-y-2.5 md:grid-cols-2">
                        <Field label={t("config.objectStorage.provider")}>
                            <Select
                                className="w-full"
                                disabled={!config.enabled}
                                value={config.provider}
                                options={OBJECT_STORAGE_PROVIDERS.map((id) => ({
                                    value: id,
                                    label: t(`config.objectStorage.providers.${OBJECT_STORAGE_PROVIDER_META[id].labelKey}`),
                                }))}
                                onChange={(value) => onProviderChange(value as ObjectStorageProvider)}
                            />
                        </Field>
                        <Field
                            label={t("config.objectStorage.region")}
                            hint={config.provider === "kodo" ? t("config.objectStorage.kodoRegionHint") : undefined}
                        >
                            <Input
                                disabled={!config.enabled}
                                value={config.region}
                                placeholder={providerMeta.regionPlaceholder}
                                onChange={(event) => patch("region", event.target.value)}
                                onBlur={(event) => commitTrimmed("region", event.target.value)}
                            />
                        </Field>
                        <Field
                            label={t("config.objectStorage.endpoint")}
                            className="md:col-span-2"
                            hint={`${t(`config.objectStorage.${providerMeta.endpointHintKey}`)}${resolvedEndpoint ? ` · ${resolvedEndpoint}` : ""}`}
                        >
                            <Input
                                disabled={!config.enabled}
                                value={config.endpoint}
                                placeholder={resolvedEndpoint || "https://..."}
                                onChange={(event) => patch("endpoint", event.target.value)}
                                onBlur={(event) => commitTrimmed("endpoint", event.target.value)}
                            />
                        </Field>
                        <Field label={t("config.objectStorage.bucket")}>
                            <Input
                                disabled={!config.enabled}
                                value={config.bucket}
                                onChange={(event) => patch("bucket", event.target.value)}
                                onBlur={(event) => commitTrimmed("bucket", event.target.value)}
                            />
                        </Field>
                        <Field label={t("config.objectStorage.pathPrefix")}>
                            <Input
                                disabled={!config.enabled}
                                value={config.pathPrefix}
                                placeholder="canvas/"
                                onChange={(event) => patch("pathPrefix", event.target.value)}
                                onBlur={(event) => commitTrimmed("pathPrefix", event.target.value)}
                            />
                        </Field>
                        <Field label={t("config.objectStorage.accessKeyId")}>
                            <Input
                                disabled={!config.enabled}
                                value={config.accessKeyId}
                                autoComplete="off"
                                onChange={(event) => patch("accessKeyId", event.target.value)}
                                onBlur={(event) => commitTrimmed("accessKeyId", event.target.value)}
                            />
                        </Field>
                        <Field label={t("config.objectStorage.secretAccessKey")}>
                            <Input.Password
                                disabled={!config.enabled}
                                value={config.secretAccessKey}
                                autoComplete="new-password"
                                onChange={(event) => patch("secretAccessKey", event.target.value)}
                                onBlur={(event) => commitTrimmed("secretAccessKey", event.target.value)}
                            />
                        </Field>
                        <Field
                            label={t("config.objectStorage.publicBaseUrl")}
                            className="md:col-span-2"
                            hint={
                                config.provider === "kodo"
                                    ? t("config.objectStorage.publicBaseUrlHintKodo")
                                    : t("config.objectStorage.publicBaseUrlHint")
                            }
                        >
                            <Input
                                disabled={!config.enabled}
                                value={config.publicBaseUrl}
                                placeholder="https://cdn.example.com"
                                onChange={(event) => patch("publicBaseUrl", event.target.value)}
                                onBlur={(event) => commitTrimmed("publicBaseUrl", event.target.value)}
                            />
                        </Field>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                        <label className="flex items-center gap-2 text-sm">
                            <Switch
                                disabled={!config.enabled}
                                checked={config.forcePathStyle === null ? pathStyle : config.forcePathStyle}
                                onChange={(checked) => patch("forcePathStyle", checked)}
                            />
                            <span>
                                {t("config.objectStorage.forcePathStyle")}
                                <span className="ml-1 text-xs text-stone-500">
                                    ({config.forcePathStyle === null ? t("config.objectStorage.pathStyleAuto") : t("config.objectStorage.pathStyleManual")})
                                </span>
                            </span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <Switch
                                disabled={!config.enabled}
                                checked={config.publicRead}
                                onChange={(checked) => patch("publicRead", checked)}
                            />
                            <span>{t("config.objectStorage.publicRead")}</span>
                        </label>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                        icon={<PlugZap className="size-4" />}
                        loading={testing}
                        disabled={!config.enabled || testing}
                        onClick={() => void testConnection()}
                    >
                        {t("config.objectStorage.test")}
                    </Button>
                </div>
            </section>
        </div>
    );
}

function Field({
    label,
    hint,
    className,
    children,
}: {
    label: string;
    hint?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <label className={`block ${className || ""}`}>
            <span className="mb-1 block text-sm font-medium leading-5">{label}</span>
            {children}
            {hint ? <span className="mt-1 block text-[11px] leading-4 text-stone-500">{hint}</span> : null}
        </label>
    );
}
