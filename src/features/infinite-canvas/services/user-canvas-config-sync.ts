import {
  defaultConfig,
  defaultWebdavSyncConfig,
  modelOptionsFromChannels,
  normalizeModelOptionValue,
  useConfigStore,
  type AiConfig,
  type WebdavSyncConfig,
} from "@canvas/stores/use-config-store";
import {
  fetchUserCanvasConfig,
  putUserCanvasConfig,
  type UserCanvasConfigBlob,
} from "@canvas/services/api/user-canvas-config";
import { isRelayApiKey } from "@canvas/integration/gateway-utils";

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
  mergedConfig.models = modelOptionsFromChannels(mergedConfig.channels);

  const webdav = {
    ...defaultWebdavSyncConfig,
    ...(webdavSource as Partial<WebdavSyncConfig>),
  };

  return { config: mergedConfig, webdav };
}

function snapshotLocalBlob(): UserCanvasConfigBlob {
  const state = useConfigStore.getState();
  return {
    config: state.config,
    webdav: state.webdav,
  };
}

function channelModelCount(config: AiConfig): number {
  return config.channels.reduce(
    (sum, channel) => sum + (channel.models?.length || 0),
    0
  );
}

function hasRelayKey(config: AiConfig): boolean {
  if (isRelayApiKey(config.apiKey)) return true;
  return config.channels.some((channel) => isRelayApiKey(channel.apiKey));
}

function configRichness(config: AiConfig, webdav: WebdavSyncConfig): number {
  let score = 0;
  score += channelModelCount(config) * 10;
  score += Math.max(0, config.channels.length - 1) * 25;
  if (hasRelayKey(config)) score += 40;
  if (config.channels.some((channel) => channel.models?.some((model) => model.script?.trim()))) {
    score += 20;
  }
  if (webdav.url?.trim()) score += 30;
  if (webdav.username?.trim() || webdav.password?.trim()) score += 10;
  if (config.systemPrompt?.trim()) score += 5;
  return score;
}

function looksLikeSparseSeed(config: AiConfig): boolean {
  return channelModelCount(config) === 0 && config.channels.length <= 1;
}

function localBlobHasUserData(local: UserCanvasConfigBlob): boolean {
  return configRichness(local.config, local.webdav) >= 20;
}

/**
 * Prefer DB, but keep browser cache when it still holds user work that the DB
 * seed does not (models, extra channels, WebDAV, scripts, missing keys).
 */
function mergeBrowserCacheWithRemote(
  remote: UserCanvasConfigBlob,
  local: UserCanvasConfigBlob
): { blob: UserCanvasConfigBlob; shouldPush: boolean } {
  const localScore = configRichness(local.config, local.webdav);
  const remoteScore = configRichness(remote.config, remote.webdav);

  if (
    localScore >= 30 &&
    localScore > remoteScore + 10 &&
    looksLikeSparseSeed(remote.config)
  ) {
    return { blob: local, shouldPush: true };
  }

  let shouldPush = false;
  const channels = remote.config.channels.map((channel) => ({
    ...channel,
    models: [...(channel.models || [])],
  }));

  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index];
    const localChannel =
      local.config.channels.find((item) => item.id === channel.id) ||
      local.config.channels[index];
    if (!localChannel) continue;

    let next = channel;
    if (!isRelayApiKey(channel.apiKey) && isRelayApiKey(localChannel.apiKey)) {
      next = { ...next, apiKey: localChannel.apiKey };
      shouldPush = true;
    }
    if (!(channel.models?.length) && localChannel.models?.length) {
      next = { ...next, models: localChannel.models };
      shouldPush = true;
    }
    // Preserve custom scripts for models that exist on both sides.
    if (channel.models?.length && localChannel.models?.length) {
      const localByName = new Map(
        localChannel.models.map((model) => [model.name, model])
      );
      const mergedModels = channel.models.map((model) => {
        const previous = localByName.get(model.name);
        if (!previous?.script?.trim() || model.script?.trim()) return model;
        shouldPush = true;
        return { ...model, script: previous.script };
      });
      next = { ...next, models: mergedModels };
    }
    channels[index] = next;
  }

  const remoteIds = new Set(channels.map((channel) => channel.id));
  for (const channel of local.config.channels) {
    if (remoteIds.has(channel.id)) continue;
    if (!(channel.models?.length || isRelayApiKey(channel.apiKey))) continue;
    channels.push(channel);
    shouldPush = true;
  }

  const models = modelOptionsFromChannels(channels);
  const config: AiConfig = {
    ...remote.config,
    // The storage directory is a device-local setting — never let the synced
    // remote config clobber it.
    customDataDir: local.config.customDataDir || remote.config.customDataDir,
    channels,
    models,
    apiKey:
      isRelayApiKey(remote.config.apiKey) || !isRelayApiKey(local.config.apiKey)
        ? remote.config.apiKey
        : local.config.apiKey,
    imageModel: normalizeModelOptionValue(
      remote.config.imageModel || local.config.imageModel,
      channels
    ),
    videoModel: normalizeModelOptionValue(
      remote.config.videoModel || local.config.videoModel,
      channels
    ),
    textModel: normalizeModelOptionValue(
      remote.config.textModel || local.config.textModel,
      channels
    ),
    audioModel: normalizeModelOptionValue(
      remote.config.audioModel || local.config.audioModel,
      channels
    ),
    model: normalizeModelOptionValue(
      remote.config.model || local.config.model,
      channels
    ),
    systemPrompt: remote.config.systemPrompt || local.config.systemPrompt,
  };
  if (config.apiKey !== remote.config.apiKey) shouldPush = true;
  if (config.systemPrompt !== remote.config.systemPrompt) shouldPush = true;

  const webdav = { ...remote.webdav };
  if (!webdav.url?.trim() && local.webdav.url?.trim()) {
    webdav.url = local.webdav.url;
    webdav.username = local.webdav.username;
    webdav.password = local.webdav.password;
    webdav.directory = local.webdav.directory || webdav.directory;
    webdav.lastSyncedAt = local.webdav.lastSyncedAt || webdav.lastSyncedAt;
    shouldPush = true;
  }

  return { blob: { config, webdav }, shouldPush };
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
 * Hydrate from DB, then merge in browser cache when it still has user data the
 * DB seed lacks (legacy users). Afterwards DB remains the source of truth and
 * localStorage is write-through.
 */
export async function hydrateUserCanvasConfigFromServer(): Promise<void> {
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    // Persist middleware may already have restored localStorage into the store.
    const local = snapshotLocalBlob();
    const remote = await fetchUserCanvasConfig();
    skipPushUntil = Date.now() + 1500;

    if (!remote.exists || !remote.config) {
      if (localBlobHasUserData(local)) {
        useConfigStore.setState({
          config: local.config,
          webdav: local.webdav,
        });
        hydratedFromDatabase = true;
        ensurePushSubscription();
        await putUserCanvasConfig(local).catch(() => undefined);
        return;
      }
      useConfigStore.setState({
        config: {
          ...defaultConfig,
          customDataDir: local.config.customDataDir,
          channels: defaultConfig.channels.map((channel) => ({
            ...channel,
            models: [...channel.models],
          })),
        },
        webdav: { ...defaultWebdavSyncConfig },
      });
      hydratedFromDatabase = false;
      ensurePushSubscription();
      return;
    }

    const normalized = normalizeRemoteBlob(remote.config);
    if (!normalized) {
      hydratedFromDatabase = false;
      ensurePushSubscription();
      return;
    }

    const { blob, shouldPush } = mergeBrowserCacheWithRemote(normalized, local);
    useConfigStore.setState({
      config: blob.config,
      webdav: blob.webdav,
    });
    hydratedFromDatabase = true;
    ensurePushSubscription();
    if (shouldPush) {
      await putUserCanvasConfig(blob).catch(() => undefined);
    }
  })().finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
}
