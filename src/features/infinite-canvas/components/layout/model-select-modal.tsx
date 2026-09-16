import { App, Button, Checkbox, Input, Modal, Tabs } from "antd";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchGatewayModelCatalog } from "@canvas/integration/sync-gateway-models";
import { isGatewayBaseUrl, isProductDefaultBaseUrl } from "@canvas/integration/gateway-utils";
import { fetchChannelModels } from "@canvas/services/api/image";
import { guessCapability, type ModelCapability, type ModelChannel } from "@canvas/stores/use-config-store";

export type ModelSelectResult = {
    name: string;
    capability?: ModelCapability;
    description?: string;
};

// Channel model selector: for the site gateway use /api/canvas/models (with
// capability). External Base URLs (e.g. ai.lingecho.com) use upstream /v1/models.
export function ModelSelectModal({
    open,
    channel,
    selectedNames,
    onConfirm,
    onClose,
}: {
    open: boolean;
    channel: ModelChannel | null;
    selectedNames: string[];
    onConfirm: (models: ModelSelectResult[]) => void;
    onClose: () => void;
}) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [existing, setExisting] = useState<string[]>([]);
    const [fetched, setFetched] = useState<string[]>([]);
    const [capabilityByName, setCapabilityByName] = useState<Map<string, ModelCapability>>(new Map());
    const [descriptionByName, setDescriptionByName] = useState<Map<string, string>>(new Map());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState("new");
    const [search, setSearch] = useState("");
    const [manual, setManual] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        setExisting(selectedNames);
        setFetched([]);
        setCapabilityByName(new Map());
        setDescriptionByName(
            new Map(
                (channel?.models || [])
                    .filter((model) => model.description?.trim())
                    .map((model) => [model.name, model.description!.trim()]),
            ),
        );
        setSelected(new Set(selectedNames));
        setActiveTab(selectedNames.length ? "existing" : "new");
        setSearch("");
        setManual("");
    }, [open, selectedNames, channel?.models]);

    const currentList = activeTab === "new" ? fetched : existing;
    const visibleList = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return currentList;
        return currentList.filter((name) => {
            const description = descriptionByName.get(name) || "";
            return name.toLowerCase().includes(keyword) || description.toLowerCase().includes(keyword);
        });
    }, [currentList, descriptionByName, search]);
    const visibleSelectedCount = visibleList.filter((name) => selected.has(name)).length;

    const toggle = (name: string, checked: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            if (checked) next.add(name);
            else next.delete(name);
            return next;
        });

    const selectVisible = (checked: boolean) =>
        setSelected((current) => {
            const next = new Set(current);
            visibleList.forEach((name) => (checked ? next.add(name) : next.delete(name)));
            return next;
        });

    const addManual = () => {
        const name = manual.trim();
        if (!name) return;
        if (!fetched.includes(name) && !existing.includes(name)) setFetched((current) => [name, ...current]);
        setCapabilityByName((current) => {
            if (current.has(name)) return current;
            const next = new Map(current);
            next.set(name, guessCapability(name));
            return next;
        });
        setSelected((current) => new Set(current).add(name));
        setManual("");
        setActiveTab("new");
    };

    const fetchModels = async () => {
        if (!channel) return;
        // Site gateway and the product default host share the capability-aware catalog.
        const useGatewayCatalog =
            isGatewayBaseUrl(channel.baseUrl) || isProductDefaultBaseUrl(channel.baseUrl);
        if (!useGatewayCatalog && (!channel.baseUrl.trim() || !channel.apiKey.trim())) {
            message.error(t("config.modelSelect.missingConfig"));
            return;
        }
        setLoading(true);
        try {
            if (useGatewayCatalog) {
                const catalog = await fetchGatewayModelCatalog(channel.apiKey);
                setFetched(catalog.map((model) => model.name));
                setCapabilityByName(new Map(catalog.map((model) => [model.name, model.capability])));
                setDescriptionByName((current) => {
                    const next = new Map(current);
                    for (const model of catalog) {
                        if (model.description?.trim()) next.set(model.name, model.description.trim());
                    }
                    return next;
                });
                setActiveTab("new");
                message.success(t("config.modelSelect.fetched", { count: catalog.length }));
            } else {
                const models = await fetchChannelModels(channel);
                setFetched(models);
                setCapabilityByName(
                    new Map(models.map((name) => [name, guessCapability(name)])),
                );
                setActiveTab("new");
                message.success(t("config.modelSelect.fetched", { count: models.length }));
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.modelSelect.fetchFailed"));
        } finally {
            setLoading(false);
        }
    };

    const confirm = () => {
        const ordered = [...existing, ...fetched].filter((name, index, list) => list.indexOf(name) === index).filter((name) => selected.has(name));
        onConfirm(
            ordered.map((name) => ({
                name,
                capability: capabilityByName.get(name) ?? guessCapability(name),
                description: descriptionByName.get(name),
            })),
        );
        onClose();
    };

    return (
        <Modal
            open={open}
            width={880}
            centered
            onCancel={onClose}
            title={
                <span>
                    {t("config.modelSelect.title")} <span className="ml-2 text-xs font-normal text-stone-500">{t("config.modelSelect.selected", { selected: selected.size, total: new Set([...existing, ...fetched]).size })}</span>
                </span>
            }
            styles={{ body: { maxHeight: "62vh", overflowY: "auto" } }}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    {t("common.cancel")}
                </Button>,
                <Button key="confirm" type="primary" onClick={confirm}>
                    {t("config.modelSelect.confirm")}
                </Button>,
            ]}
        >
            <div className="flex flex-wrap items-center gap-3">
                <Input className="min-w-[200px] flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("config.modelSelect.search")} prefix={<Search className="size-4 text-stone-400" />} allowClear />
                <Input className="min-w-[180px] flex-1" value={manual} onChange={(event) => setManual(event.target.value)} onPressEnter={addManual} placeholder={t("config.modelSelect.modelName")} />
                <Button onClick={addManual}>{t("config.modelSelect.add")}</Button>
                <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void fetchModels()}>
                    {t("config.modelSelect.fetch")}
                </Button>
            </div>
            <div className="mt-2 text-xs text-stone-500">{t("config.modelSelect.description")}</div>

            <Tabs
                className="mt-3"
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    { key: "new", label: t("config.modelSelect.fetchedTab", { count: fetched.length }) },
                    { key: "existing", label: t("config.modelSelect.existingTab", { count: existing.length }) },
                ]}
            />

            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-stone-500">{t("config.modelSelect.visibleSelected", { selected: visibleSelectedCount, total: visibleList.length })}</span>
                <div className="flex gap-2">
                    <Button size="small" disabled={!visibleList.length} onClick={() => selectVisible(true)}>
                        {t("config.modelSelect.selectVisible")}
                    </Button>
                    <Button size="small" disabled={!visibleSelectedCount} onClick={() => selectVisible(false)}>
                        {t("config.modelSelect.clearVisible")}
                    </Button>
                </div>
            </div>

            {visibleList.length ? (
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                    {visibleList.map((name) => {
                        const description = descriptionByName.get(name);
                        return (
                            <div key={name} className="min-w-0 overflow-hidden rounded-md border border-stone-100 px-2.5 py-2 dark:border-stone-800">
                                <Checkbox
                                    className="!flex w-full !items-start [&_.ant-checkbox]:mt-1 [&_.ant-checkbox+span]:min-w-0 [&_.ant-checkbox+span]:flex-1 [&_.ant-checkbox+span]:overflow-hidden"
                                    checked={selected.has(name)}
                                    onChange={(event) => toggle(name, event.target.checked)}
                                >
                                    <span className="flex min-w-0 flex-col gap-0.5" title={description ? `${name} — ${description}` : name}>
                                        <span className="flex min-w-0 items-baseline gap-2">
                                            <span className="min-w-0 truncate font-medium">{name}</span>
                                            {capabilityByName.get(name) ? (
                                                <span className="shrink-0 text-xs text-stone-400">{t(`config.channelEditor.capabilities.${capabilityByName.get(name)}`)}</span>
                                            ) : null}
                                        </span>
                                        {description ? (
                                            <span className="line-clamp-2 break-words text-xs font-normal leading-5 text-stone-400">{description}</span>
                                        ) : null}
                                    </span>
                                </Checkbox>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="py-8 text-center text-sm text-stone-500">{t(activeTab === "new" ? "config.modelSelect.fetchedEmpty" : "config.modelSelect.existingEmpty")}</div>
            )}
        </Modal>
    );
}
