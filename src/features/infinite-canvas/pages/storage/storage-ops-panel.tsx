import {
    Link2,
    MonitorSmartphone,
    Plus,
    RefreshCw,
    Trash2,
    Upload as UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Modal, Select, Space, Table, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import {
    OPS_PLATFORMS,
    type OpsAccount,
    type OpsContentMetrics,
    type OpsPlatform,
    type OpsPublishJob,
    type OpsStoreState,
} from "@canvas/lib/ops/types";
import { isTauri } from "@canvas/services/fs-store";
import {
    appendMetricsSnapshot,
    diffMetrics,
    enqueuePublishJob,
    latestSnapshotForAccount,
    loadOpsStore,
    markAccountLogin,
    previousDaySnapshot,
    removeOpsAccount,
    updatePublishJob,
    upsertOpsAccount,
} from "@canvas/services/ops-store";
import {
    cancelOpsJob,
    isOpsRunnerAvailable,
    runOpsLogin,
    runOpsPublish,
    runOpsSync,
} from "@canvas/services/ops-runner";
import { cn } from "@canvas/lib/utils";

function platformLabel(platform: OpsPlatform, t: (key: string) => string) {
    return t(`storageManager.ops.platforms.${platform}`);
}

function statusColor(status: OpsAccount["status"]) {
    if (status === "active") return "success";
    if (status === "expired") return "warning";
    return "default";
}

function formatDelta(value?: number) {
    if (typeof value !== "number") return "—";
    if (value > 0) return `+${value}`;
    return String(value);
}

export function StorageOpsPanel() {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const desktop = isTauri();

    const [store, setStore] = useState<OpsStoreState | null>(null);
    const [loading, setLoading] = useState(false);
    const [runnerOk, setRunnerOk] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    const [bindOpen, setBindOpen] = useState(false);
    const [bindPlatform, setBindPlatform] = useState<OpsPlatform>("douyin");
    const [bindName, setBindName] = useState("");
    const [loginQr, setLoginQr] = useState<string | null>(null);

    const [publishOpen, setPublishOpen] = useState(false);
    const [publishTitle, setPublishTitle] = useState("");
    const [publishTags, setPublishTags] = useState("");
    const [publishVideoPath, setPublishVideoPath] = useState("");

    const reload = useCallback(async () => {
        if (!desktop) {
            setStore(null);
            return;
        }
        setLoading(true);
        try {
            const next = await loadOpsStore();
            setStore(next);
            setSelectedAccountId((prev) => prev || next.accounts[0]?.id || null);
            setRunnerOk(await isOpsRunnerAvailable());
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageManager.ops.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [desktop, message, t]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const selectedAccount = useMemo(
        () => store?.accounts.find((item) => item.id === selectedAccountId) || null,
        [selectedAccountId, store],
    );

    const latest = useMemo(() => {
        if (!store || !selectedAccount) return null;
        return latestSnapshotForAccount(store, selectedAccount.id);
    }, [selectedAccount, store]);

    const previous = useMemo(() => {
        if (!store || !selectedAccount || !latest) return null;
        return previousDaySnapshot(store, selectedAccount.id, latest.dayKey);
    }, [latest, selectedAccount, store]);

    const metricsRows = useMemo(() => {
        if (!latest) return [] as Array<OpsContentMetrics & { deltaPlay?: number; deltaLike?: number }>;
        const prevMap = new Map((previous?.items || []).map((item) => [item.title, item]));
        return latest.items.map((item) => {
            const delta = diffMetrics(item, prevMap.get(item.title));
            return {
                ...item,
                deltaPlay: delta.playCount,
                deltaLike: delta.likeCount,
            };
        });
    }, [latest, previous]);

    const pushLog = (line: string) => {
        setLogLines((prev) => [...prev.slice(-80), line]);
    };

    const onBind = async () => {
        if (!desktop) return;
        if (!runnerOk) {
            message.error(t("storageManager.ops.runnerMissing"));
            return;
        }
        setBusy("bind");
        setLogLines([]);
        setLoginQr(null);
        try {
            const account = await upsertOpsAccount({
                platform: bindPlatform,
                displayName: bindName || platformLabel(bindPlatform, t),
            });
            pushLog(t("storageManager.ops.logQrLogin"));
            let sawQr = false;
            await runOpsLogin(
                {
                    platform: account.platform,
                    accountId: account.id,
                    statePath: account.statePath,
                },
                (event) => {
                    if (event.type === "qr" && event.qrDataUrl) {
                        sawQr = true;
                        setLoginQr(event.qrDataUrl);
                        pushLog(t("storageManager.ops.logQrReady"));
                    } else if (event.message) {
                        pushLog(event.message);
                    }
                },
            );
            if (!sawQr) {
                await markAccountLogin(account.id, "unknown");
                throw new Error(t("storageManager.ops.bindNoQr"));
            }
            await markAccountLogin(account.id, "active");
            message.success(t("storageManager.ops.bindSuccess"));
            setBindOpen(false);
            setBindName("");
            setLoginQr(null);
            await reload();
            setSelectedAccountId(account.id);
        } catch (error) {
            const text = error instanceof Error ? error.message : t("storageManager.ops.bindFailed");
            if (text.includes("OPS_CANCELLED") || /cancel/i.test(text)) {
                message.info(t("storageManager.ops.bindCancelled"));
            } else {
                message.error(text);
            }
        } finally {
            setBusy(null);
        }
    };

    const onCancelBind = async () => {
        if (busy !== "bind") {
            setBindOpen(false);
            setLoginQr(null);
            return;
        }
        await cancelOpsJob();
        setLoginQr(null);
        setBusy(null);
        message.info(t("storageManager.ops.bindCancelled"));
    };

    const onSync = async (account: OpsAccount) => {
        if (!runnerOk) {
            message.error(t("storageManager.ops.runnerMissing"));
            return;
        }
        setBusy(`sync:${account.id}`);
        setLogLines([]);
        try {
            pushLog(t("storageManager.ops.logSyncStart"));
            const { items } = await runOpsSync(
                {
                    platform: account.platform,
                    accountId: account.id,
                    statePath: account.statePath,
                },
                (event) => {
                    if (event.message) pushLog(event.message);
                },
            );
            await appendMetricsSnapshot({
                accountId: account.id,
                platform: account.platform,
                items,
            });
            message.success(t("storageManager.ops.syncSuccess", { count: items.length }));
            await reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("storageManager.ops.syncFailed"));
        } finally {
            setBusy(null);
        }
    };

    const pickVideo = async () => {
        if (!desktop) return;
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
            multiple: false,
            filters: [{ name: "Video", extensions: ["mp4", "mov", "webm", "mkv", "m4v"] }],
        });
        if (typeof selected === "string") setPublishVideoPath(selected);
        else if (Array.isArray(selected) && selected[0]) setPublishVideoPath(selected[0]);
    };

    const onPublish = async () => {
        if (!selectedAccount) return;
        if (!publishVideoPath) {
            message.warning(t("storageManager.ops.needVideo"));
            return;
        }
        if (!publishTitle.trim()) {
            message.warning(t("storageManager.ops.needTitle"));
            return;
        }
        setBusy("publish");
        setLogLines([]);
        let job: OpsPublishJob | null = null;
        try {
            const tags = publishTags
                .split(/[,，\s]+/)
                .map((item) => item.trim())
                .filter(Boolean);
            job = await enqueuePublishJob({
                accountId: selectedAccount.id,
                platform: selectedAccount.platform,
                title: publishTitle.trim(),
                tags,
                videoPath: publishVideoPath,
            });
            if (!runnerOk) throw new Error(t("storageManager.ops.runnerMissing"));
            await updatePublishJob(job.id, { status: "running" });
            pushLog(t("storageManager.ops.logPublishStart"));
            const result = (await runOpsPublish(
                {
                    platform: selectedAccount.platform,
                    accountId: selectedAccount.id,
                    statePath: selectedAccount.statePath,
                    videoPath: publishVideoPath,
                    title: publishTitle.trim(),
                    tags,
                },
                (event) => {
                    if (event.message) pushLog(event.message);
                },
            )) as { remoteUrl?: string } | null;
            await updatePublishJob(job.id, {
                status: "success",
                remoteUrl: result?.remoteUrl,
            });
            message.success(t("storageManager.ops.publishSuccess"));
            setPublishOpen(false);
            setPublishTitle("");
            setPublishTags("");
            setPublishVideoPath("");
            await reload();
        } catch (error) {
            if (job) {
                await updatePublishJob(job.id, {
                    status: "failed",
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            message.error(error instanceof Error ? error.message : t("storageManager.ops.publishFailed"));
            await reload();
        } finally {
            setBusy(null);
        }
    };

    const onDeleteAccount = (account: OpsAccount) => {
        modal.confirm({
            title: t("storageManager.ops.deleteAccountTitle", { name: account.displayName }),
            content: t("storageManager.ops.deleteAccountDesc"),
            okButtonProps: { danger: true },
            onOk: async () => {
                await removeOpsAccount(account.id);
                message.success(t("storageManager.ops.deleted"));
                await reload();
            },
        });
    };

    if (!desktop) {
        return (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300/80 px-6 py-16 dark:border-stone-700">
                <MonitorSmartphone className="size-10 text-stone-400" />
                <div className="max-w-md text-center text-sm text-stone-500 dark:text-stone-400">
                    {t("storageManager.ops.desktopOnly")}
                </div>
            </div>
        );
    }

    return (
        <div className="mt-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-stone-500 dark:text-stone-400">
                    {!runnerOk ? (
                        <span className="text-amber-600 dark:text-amber-400">
                            {t("storageManager.ops.runnerMissing")}
                        </span>
                    ) : (
                        <span />
                    )}
                </div>
                <Space wrap>
                    <Button icon={<RefreshCw className={cn("size-3.5", loading && "animate-spin")} />} onClick={() => void reload()}>
                        {t("storageManager.reload")}
                    </Button>
                    <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => setBindOpen(true)} disabled={Boolean(busy)}>
                        {t("storageManager.ops.bindAccount")}
                    </Button>
                </Space>
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded-xl border border-stone-200/80 p-3 dark:border-stone-800">
                    <div className="mb-2 text-sm font-medium">{t("storageManager.ops.accounts")}</div>
                    {!store?.accounts.length ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("storageManager.ops.noAccounts")} />
                    ) : (
                        <div className="space-y-2">
                            {store.accounts.map((account) => {
                                const active = account.id === selectedAccountId;
                                return (
                                    <button
                                        key={account.id}
                                        type="button"
                                        className={cn(
                                            "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                                            active
                                                ? "border-stone-400 bg-stone-100/80 dark:border-stone-500 dark:bg-stone-800/70"
                                                : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900",
                                        )}
                                        onClick={() => setSelectedAccountId(account.id)}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{account.displayName}</div>
                                                <div className="text-xs text-stone-500">
                                                    {platformLabel(account.platform, t)}
                                                </div>
                                            </div>
                                            <Tag color={statusColor(account.status)}>
                                                {t(`storageManager.ops.accountStatus.${account.status}`)}
                                            </Tag>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    {selectedAccount ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    icon={<RefreshCw className="size-3.5" />}
                                    loading={busy === `sync:${selectedAccount.id}`}
                                    onClick={() => void onSync(selectedAccount)}
                                >
                                    {t("storageManager.ops.syncData")}
                                </Button>
                                <Button
                                    type="primary"
                                    icon={<UploadIcon className="size-3.5" />}
                                    onClick={() => setPublishOpen(true)}
                                    disabled={Boolean(busy)}
                                >
                                    {t("storageManager.ops.publishVideo")}
                                </Button>
                                <Tooltip title={t("storageManager.ops.deleteAccount")}>
                                    <Button
                                        danger
                                        icon={<Trash2 className="size-3.5" />}
                                        onClick={() => onDeleteAccount(selectedAccount)}
                                    />
                                </Tooltip>
                            </div>

                            <div className="rounded-xl border border-stone-200/80 p-3 dark:border-stone-800">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium">{t("storageManager.ops.metricsTitle")}</div>
                                    <div className="text-xs text-stone-500">
                                        {latest
                                            ? t("storageManager.ops.snapshotAt", {
                                                  time: new Date(latest.capturedAt).toLocaleString(),
                                              })
                                            : t("storageManager.ops.noSnapshot")}
                                    </div>
                                </div>
                                <Table
                                    size="small"
                                    rowKey="contentId"
                                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                                    dataSource={metricsRows}
                                    locale={{ emptyText: t("storageManager.ops.metricsEmpty") }}
                                    columns={[
                                        {
                                            title: t("storageManager.ops.colTitle"),
                                            dataIndex: "title",
                                            ellipsis: true,
                                        },
                                        {
                                            title: t("storageManager.ops.colPlay"),
                                            dataIndex: "playCount",
                                            width: 90,
                                            render: (value: number | undefined, row) => (
                                                <span>
                                                    {value ?? "—"}
                                                    <span className="ml-1 text-xs text-stone-400">
                                                        {formatDelta(row.deltaPlay)}
                                                    </span>
                                                </span>
                                            ),
                                        },
                                        {
                                            title: t("storageManager.ops.colLike"),
                                            dataIndex: "likeCount",
                                            width: 90,
                                            render: (value: number | undefined, row) => (
                                                <span>
                                                    {value ?? "—"}
                                                    <span className="ml-1 text-xs text-stone-400">
                                                        {formatDelta(row.deltaLike)}
                                                    </span>
                                                </span>
                                            ),
                                        },
                                        {
                                            title: t("storageManager.ops.colComment"),
                                            dataIndex: "commentCount",
                                            width: 80,
                                            render: (value?: number) => value ?? "—",
                                        },
                                        {
                                            title: t("storageManager.ops.colShare"),
                                            dataIndex: "shareCount",
                                            width: 80,
                                            render: (value?: number) => value ?? "—",
                                        },
                                    ]}
                                />
                            </div>

                            <div className="rounded-xl border border-stone-200/80 p-3 dark:border-stone-800">
                                <div className="mb-2 text-sm font-medium">{t("storageManager.ops.recentJobs")}</div>
                                <Table
                                    size="small"
                                    rowKey="id"
                                    pagination={false}
                                    dataSource={(store?.publishJobs || [])
                                        .filter((job) => job.accountId === selectedAccount.id)
                                        .slice(0, 8)}
                                    locale={{ emptyText: t("storageManager.ops.noJobs") }}
                                    columns={[
                                        {
                                            title: t("storageManager.ops.colTitle"),
                                            dataIndex: "title",
                                            ellipsis: true,
                                        },
                                        {
                                            title: t("storageManager.ops.colStatus"),
                                            dataIndex: "status",
                                            width: 100,
                                            render: (status: OpsPublishJob["status"]) => (
                                                <Tag>{t(`storageManager.ops.publishStatus.${status}`)}</Tag>
                                            ),
                                        },
                                        {
                                            title: t("storageManager.ops.colTime"),
                                            dataIndex: "updatedAt",
                                            width: 160,
                                            render: (value: number) => new Date(value).toLocaleString(),
                                        },
                                        {
                                            title: t("storageManager.colActions"),
                                            width: 70,
                                            render: (_: unknown, job: OpsPublishJob) =>
                                                job.remoteUrl ? (
                                                    <Tooltip title={job.remoteUrl}>
                                                        <Link2 className="size-3.5 text-stone-500" />
                                                    </Tooltip>
                                                ) : null,
                                        },
                                    ]}
                                />
                            </div>
                        </>
                    ) : (
                        <Empty description={t("storageManager.ops.selectAccount")} />
                    )}

                    {logLines.length ? (
                        <pre className="max-h-40 overflow-auto rounded-xl border border-stone-200/80 bg-stone-50 p-3 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300">
                            {logLines.join("\n")}
                        </pre>
                    ) : null}
                </div>
            </div>

            <Modal
                title={t("storageManager.ops.bindAccount")}
                open={bindOpen}
                onCancel={() => void onCancelBind()}
                onOk={() => void onBind()}
                confirmLoading={busy === "bind"}
                okText={busy === "bind" ? t("storageManager.ops.waitingScan") : t("storageManager.ops.startLogin")}
                okButtonProps={{ disabled: busy === "bind" }}
                cancelText={busy === "bind" ? t("storageManager.ops.cancelLogin") : t("common.cancel")}
                closable
                maskClosable={busy !== "bind"}
            >
                <div className="space-y-3 pt-2">
                    {busy !== "bind" ? (
                        <>
                            <div>
                                <div className="mb-1 text-sm">{t("storageManager.ops.platform")}</div>
                                <Select
                                    className="w-full"
                                    value={bindPlatform}
                                    onChange={setBindPlatform}
                                    options={OPS_PLATFORMS.map((platform) => ({
                                        value: platform,
                                        label: platformLabel(platform, t),
                                    }))}
                                />
                            </div>
                            <div>
                                <div className="mb-1 text-sm">{t("storageManager.ops.accountName")}</div>
                                <Input
                                    value={bindName}
                                    onChange={(event) => setBindName(event.target.value)}
                                    placeholder={t("storageManager.ops.accountNamePlaceholder")}
                                />
                            </div>
                            <div className="text-xs text-stone-500">{t("storageManager.ops.bindHint")}</div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-2">
                            <div className="text-sm text-stone-600 dark:text-stone-300">
                                {loginQr
                                    ? t("storageManager.ops.scanQrHint")
                                    : t("storageManager.ops.fetchingQr")}
                            </div>
                            {loginQr ? (
                                <img
                                    src={loginQr}
                                    alt="login-qr"
                                    className="size-52 rounded-xl border border-stone-200 bg-white p-2 dark:border-stone-700"
                                />
                            ) : (
                                <div className="flex size-52 items-center justify-center rounded-xl border border-dashed border-stone-300 text-xs text-stone-400 dark:border-stone-700">
                                    {t("storageManager.ops.fetchingQr")}
                                </div>
                            )}
                            <div className="max-w-sm text-center text-xs text-stone-500">
                                {t("storageManager.ops.scanQrPlatform", {
                                    platform: platformLabel(bindPlatform, t),
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                title={t("storageManager.ops.publishVideo")}
                open={publishOpen}
                onCancel={() => setPublishOpen(false)}
                onOk={() => void onPublish()}
                confirmLoading={busy === "publish"}
                okText={t("storageManager.ops.startPublish")}
            >
                <div className="space-y-3 pt-2">
                    <div>
                        <div className="mb-1 text-sm">{t("storageManager.ops.videoFile")}</div>
                        <div className="flex gap-2">
                            <Input
                                value={publishVideoPath}
                                onChange={(event) => setPublishVideoPath(event.target.value)}
                                placeholder={t("storageManager.ops.videoPathPlaceholder")}
                            />
                            <Button onClick={() => void pickVideo()}>{t("storageManager.ops.pickVideo")}</Button>
                        </div>
                    </div>
                    <div>
                        <div className="mb-1 text-sm">{t("storageManager.ops.title")}</div>
                        <Input
                            value={publishTitle}
                            maxLength={30}
                            showCount
                            onChange={(event) => setPublishTitle(event.target.value)}
                        />
                    </div>
                    <div>
                        <div className="mb-1 text-sm">{t("storageManager.ops.tags")}</div>
                        <Input
                            value={publishTags}
                            onChange={(event) => setPublishTags(event.target.value)}
                            placeholder={t("storageManager.ops.tagsPlaceholder")}
                        />
                    </div>
                    <div className="text-xs text-stone-500">{t("storageManager.ops.publishHint")}</div>
                </div>
            </Modal>
        </div>
    );
}
