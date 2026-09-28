import {
    defaultConfig,
    defaultWebdavSyncConfig,
    modelOptionsFromChannels,
    useConfigStore,
    type AiConfig,
    type WebdavSyncConfig,
} from "@canvas/stores/use-config-store";
import {
    fetchUserCanvasConfig,
    putUserCanvasConfig,
    type UserCanvasConfigBlob,
} from "@canvas/services/api/user-canvas-config";
import { resolveProductBaseUrl } from "@canvas/integration/gateway-utils";

let hydratePromise: Promise<void> | null = null;
let skipPushUntil = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;
let hydratedFromDatabase = false;

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function normalizeRemoteBlob(raw: unknown): UserCanvasConfigBlob | null {
    const root = asObject(raw);
    if (!root) return null;

    // Accept either { config, webdav } or a bare AiConfig for forward-compat.
    const maybeNested = asObject(root.config);
    const configSource = maybeNested || root;
    const webdavSource = asObject(root.webdav) || {};

    const mergedConfig = {
        ...defaultConfig,
        ...(configSource as Partial<AiConfig>),
    } as AiConfig;
    if (!Array.isArray(mergedConfig.channels)) {
        mergedConfig.channels = defaultConfig.channels;
    }
    // Rewrite retired product hosts (canvas.lingecho.com, dev origins) to the
    // current backend; custom remote channels are untouched.
    mergedConfig.baseUrl = resolveProductBaseUrl(mergedConfig.baseUrl);
    mergedConfig.channels = mergedConfig.channels.map((channel) => ({
        ...channel,
        baseUrl: resolveProductBaseUrl(channel.baseUrl),
    }));
    mergedConfig.models = modelOptionsFromChannels(mergedConfig.channels);

    const webdav = {
        ...defaultWebdavSyncConfig,
        ...(webdavSource as Partial<WebdavSyncConfig>),
    };

    return { config: mergedConfig, webdav };
}

async function pushLocalConfig() {
    if (!hydratedFromDatabase || Date.now() < skipPushUntil) return;
    const state = useConfigStore.getState();
    await putUserCanvasConfig({
        config: state.config,
        webdav: state.webdav,
    });
}

function schedulePush() {
    if (!hydratedFromDatabase || Date.now() < skipPushUntil) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        pushTimer = null;
        void pushLocalConfig().catch(() => undefined);
    }, 800);
}

function ensurePushSubscription() {
    if (subscribed) return;
    subscribed = true;
    useConfigStore.subscribe((state, prev) => {
        if (state.config === prev.config && state.webdav === prev.webdav) return;
        schedulePush();
    });
}

/**
 * The server record is the single source of truth: hydrate applies it verbatim
 * and every later change is written through. Nothing is read from local
 * storage — `customDataDir` is the only device-scoped setting kept per session.
 */
export async function hydrateUserCanvasConfigFromServer(): Promise<void> {
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
        const remote = await fetchUserCanvasConfig();
        skipPushUntil = Date.now() + 1500;

        const normalized = remote.exists && remote.config ? normalizeRemoteBlob(remote.config) : null;
        if (normalized) {
            const currentDir = useConfigStore.getState().config.customDataDir;
            useConfigStore.setState({
                config: {
                    ...normalized.config,
                    // The storage directory is device-local; keep the value the
                    // user picked this session, otherwise adopt the remote one.
                    customDataDir: currentDir || normalized.config.customDataDir,
                },
                webdav: normalized.webdav,
            });
            hydratedFromDatabase = true;
            ensurePushSubscription();
            return;
        }

        // No remote record yet — seed it with the current (default) config so
        // the server stays authoritative for subsequent sessions.
        hydratedFromDatabase = true;
        ensurePushSubscription();
        const state = useConfigStore.getState();
        await putUserCanvasConfig({ config: state.config, webdav: state.webdav }).catch(() => undefined);
    })().finally(() => {
        hydratePromise = null;
    });

    return hydratePromise;
}
