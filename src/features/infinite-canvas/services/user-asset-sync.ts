import { getMediaBlob, resolveMediaUrl } from "@canvas/services/file-storage";
import { getImageBlob, resolveImageUrl } from "@canvas/services/image-storage";
import { uploadCanvasMedia } from "@canvas/services/object-storage";
import type { Asset } from "@canvas/stores/use-asset-store";
import { useAssetStore } from "@canvas/stores/use-asset-store";
import {
  deleteUserAssetsByClientIds,
  listAllUserAssets,
  upsertUserAsset,
  type UserAssetDTO,
  type UpsertUserAssetInput,
} from "@canvas/services/api/user-assets";

function isDurableUrl(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

/** Prefer upstream/public https URLs; ignore blob/data. */
function firstDurableUrl(...candidates: Array<string | undefined | null>) {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (isDurableUrl(value)) return value;
  }
  return "";
}

function metadataDurableUrls(metadata?: Record<string, unknown>) {
  if (!metadata) return [] as string[];
  const keys = ["upstreamUrl", "upstream_url", "sourceUrl", "source_url", "originalUrl", "original_url", "video_url", "result_url", "url"];
  return keys.map((key) => {
    const value = metadata[key];
    return typeof value === "string" ? value : "";
  });
}

function toUnixSeconds(iso: string | undefined) {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function fromUnixSeconds(sec: number | undefined) {
  if (!sec || sec <= 0) return new Date().toISOString();
  return new Date(sec * 1000).toISOString();
}

export function assetToUpsertInput(asset: Asset): UpsertUserAssetInput | null {
  const base = {
    client_id: asset.id,
    kind: asset.kind,
    title: asset.title,
    cover_url: asset.coverUrl,
    tags: asset.tags || [],
    source: asset.source || "",
    note: asset.note || "",
    metadata: asset.metadata || {},
  };
  if (asset.kind === "text") {
    if (!asset.data.content.trim()) return null;
    return { ...base, content: asset.data.content };
  }
  if (asset.kind === "image") {
    const mediaUrl = firstDurableUrl(asset.data.dataUrl, asset.coverUrl, ...metadataDurableUrls(asset.metadata));
    const storageKey = asset.data.storageKey || "";
    if (!mediaUrl && !storageKey) return null;
    return {
      ...base,
      cover_url: firstDurableUrl(asset.coverUrl, mediaUrl),
      media_url: mediaUrl,
      storage_key: storageKey,
      mime_type: asset.data.mimeType,
      width: asset.data.width,
      height: asset.data.height,
      bytes: asset.data.bytes,
    };
  }
  const mediaUrl = firstDurableUrl(asset.data.url, ...metadataDurableUrls(asset.metadata));
  const storageKey = asset.data.storageKey || "";
  if (!mediaUrl && !storageKey) return null;
  return {
    ...base,
    media_url: mediaUrl,
    storage_key: storageKey,
    mime_type: asset.data.mimeType,
    width: asset.data.width,
    height: asset.data.height,
    bytes: asset.data.bytes,
  };
}

export function userAssetDtoToAsset(dto: UserAssetDTO): Asset | null {
  const clientId = (dto.client_id || "").trim() || `server-${dto.id}`;
  const base = {
    id: clientId,
    title: dto.title || dto.kind,
    coverUrl: dto.cover_url || "",
    tags: Array.isArray(dto.tags) ? dto.tags : [],
    source: dto.source || undefined,
    note: dto.note || undefined,
    createdAt: fromUnixSeconds(dto.created_at),
    updatedAt: fromUnixSeconds(dto.updated_at),
    metadata: {
      ...(dto.metadata || {}),
      serverId: dto.id,
    },
  };

  if (dto.kind === "text") {
    if (!(dto.content || "").trim()) return null;
    return { ...base, kind: "text", data: { content: dto.content || "" } };
  }
  if (dto.kind === "image") {
    const mediaUrl = dto.media_url || dto.cover_url || "";
    if (!mediaUrl && !dto.storage_key) return null;
    return {
      ...base,
      kind: "image",
      coverUrl: dto.cover_url || mediaUrl,
      data: {
        dataUrl: mediaUrl,
        storageKey: dto.storage_key || undefined,
        width: dto.width || 0,
        height: dto.height || 0,
        bytes: dto.bytes || 0,
        mimeType: dto.mime_type || "image/png",
      },
    };
  }
  if (dto.kind === "video") {
    const mediaUrl = dto.media_url || "";
    if (!mediaUrl && !dto.storage_key) return null;
    return {
      ...base,
      kind: "video",
      data: {
        url: mediaUrl,
        storageKey: dto.storage_key || undefined,
        width: dto.width || 0,
        height: dto.height || 0,
        bytes: dto.bytes || 0,
        mimeType: dto.mime_type || "video/mp4",
      },
    };
  }
  return null;
}

async function blobFromUrl(url: string): Promise<Blob | null> {
  if (!url || url.startsWith("data:")) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Resolve a durable media URL for cloud sync.
 * Priority: existing upstream/public https → 七猴图床 → keep local-only.
 */
async function ensureDurableAssetMedia(asset: Asset): Promise<Asset> {
  if (asset.kind === "text") return asset;

  if (asset.kind === "image") {
    const existing = firstDurableUrl(asset.data.dataUrl, asset.coverUrl, ...metadataDurableUrls(asset.metadata));
    if (existing) {
      return {
        ...asset,
        coverUrl: firstDurableUrl(asset.coverUrl, existing) || existing,
        data: { ...asset.data, dataUrl: existing },
        metadata: { ...asset.metadata, upstreamUrl: firstDurableUrl(...metadataDurableUrls(asset.metadata), existing) || existing },
      };
    }
    let blob: Blob | null = null;
    if (asset.data.storageKey) blob = await getImageBlob(asset.data.storageKey);
    if (!blob && asset.data.dataUrl) {
      if (asset.data.dataUrl.startsWith("data:")) {
        const response = await fetch(asset.data.dataUrl);
        blob = await response.blob();
      } else {
        blob = await blobFromUrl(asset.data.dataUrl);
      }
    }
    if (!blob && asset.coverUrl) blob = await blobFromUrl(asset.coverUrl);
    if (!blob) return asset;
    try {
      const uploaded = await uploadCanvasMedia(blob, {
        contentType: asset.data.mimeType || blob.type || "image/png",
        purpose: "canvas",
      });
      if (!uploaded?.accessUrl) return asset;
      return {
        ...asset,
        coverUrl: uploaded.accessUrl,
        data: {
          ...asset.data,
          dataUrl: uploaded.accessUrl,
          bytes: uploaded.bytes || asset.data.bytes,
          mimeType: uploaded.mimeType || asset.data.mimeType,
        },
      };
    } catch {
      return asset;
    }
  }

  const existing = firstDurableUrl(asset.data.url, ...metadataDurableUrls(asset.metadata));
  if (existing) {
    return {
      ...asset,
      data: { ...asset.data, url: existing },
      metadata: { ...asset.metadata, upstreamUrl: firstDurableUrl(...metadataDurableUrls(asset.metadata), existing) || existing },
    };
  }

  let blob: Blob | null = null;
  if (asset.data.storageKey) blob = await getMediaBlob(asset.data.storageKey);
  if (!blob && asset.data.url) blob = await blobFromUrl(asset.data.url);
  if (!blob) return asset;
  try {
    const uploaded = await uploadCanvasMedia(blob, {
      contentType: asset.data.mimeType || blob.type || "video/mp4",
      purpose: "canvas",
    });
    if (!uploaded?.accessUrl) return asset;
    return {
      ...asset,
      data: {
        ...asset.data,
        url: uploaded.accessUrl,
        bytes: uploaded.bytes || asset.data.bytes,
        mimeType: uploaded.mimeType || asset.data.mimeType,
      },
    };
  } catch {
    return asset;
  }
}

function patchLocalAsset(asset: Asset) {
  useAssetStore.setState((state) => ({
    assets: state.assets.map((item) => (item.id === asset.id ? asset : item)),
  }));
}

/** Best-effort upsert for a single local asset. */
export function syncUserAsset(asset: Asset) {
  void (async () => {
    try {
      const prepared = await ensureDurableAssetMedia(asset);
      if (prepared !== asset && (prepared.kind === "video" ? isDurableUrl(prepared.data.url) : prepared.kind === "image" ? isDurableUrl(prepared.data.dataUrl) : false)) {
        patchLocalAsset(prepared);
      }
      const input = assetToUpsertInput(prepared);
      if (!input) return;
      await upsertUserAsset(input);
    } catch {
      // Cloud sync is best-effort; never surface to the user.
    }
  })();
}

/** Best-effort delete by local client ids. */
export function syncRemoveUserAssets(clientIds: string[]) {
  void deleteUserAssetsByClientIds(clientIds);
}

function preferPlayableMedia(local: Asset, remote: Asset): Asset {
  const localTs = toUnixSeconds(local.updatedAt);
  const remoteTs = toUnixSeconds(remote.updatedAt);
  const newer = localTs >= remoteTs ? local : remote;
  const older = newer === local ? remote : local;

  if (newer.kind === "image" && older.kind === "image") {
    const durable =
      firstDurableUrl(newer.data.dataUrl, older.data.dataUrl, newer.coverUrl, older.coverUrl) ||
      newer.data.dataUrl ||
      older.data.dataUrl ||
      "";
    return {
      ...newer,
      coverUrl: firstDurableUrl(newer.coverUrl, older.coverUrl, durable) || newer.coverUrl,
      data: {
        ...newer.data,
        dataUrl: durable,
        storageKey: newer.data.storageKey || older.data.storageKey,
      },
      metadata: {
        ...older.metadata,
        ...newer.metadata,
        upstreamUrl: firstDurableUrl(...metadataDurableUrls(newer.metadata), ...metadataDurableUrls(older.metadata), durable) || undefined,
      },
    };
  }

  if (newer.kind === "video" && older.kind === "video") {
    const durable =
      firstDurableUrl(newer.data.url, older.data.url, ...metadataDurableUrls(newer.metadata), ...metadataDurableUrls(older.metadata)) ||
      newer.data.url ||
      older.data.url ||
      "";
    return {
      ...newer,
      data: {
        ...newer.data,
        url: durable,
        storageKey: newer.data.storageKey || older.data.storageKey,
      },
      metadata: {
        ...older.metadata,
        ...newer.metadata,
        upstreamUrl: firstDurableUrl(...metadataDurableUrls(newer.metadata), ...metadataDurableUrls(older.metadata), durable) || undefined,
      },
    };
  }

  return newer;
}

function mergeAssets(local: Asset[], remote: Asset[]): Asset[] {
  const map = new Map<string, Asset>();
  for (const item of remote) {
    if (item.id) map.set(item.id, item);
  }
  for (const item of local) {
    if (!item.id) continue;
    const current = map.get(item.id);
    map.set(item.id, current ? preferPlayableMedia(item, current) : item);
  }
  return Array.from(map.values()).sort((a, b) => toUnixSeconds(b.updatedAt) - toUnixSeconds(a.updatedAt));
}

let hydratePromise: Promise<void> | null = null;

/**
 * Pull cloud assets, merge with IndexedDB cache, push local-only rows up.
 * Safe to call multiple times; concurrent calls share one promise.
 */
export async function hydrateUserAssetsFromServer(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const waitHydrated = () =>
      new Promise<void>((resolve) => {
        if (useAssetStore.getState().hydrated) {
          resolve();
          return;
        }
        const unsub = useAssetStore.subscribe((state) => {
          if (!state.hydrated) return;
          unsub();
          resolve();
        });
      });
    await waitHydrated();

    const remoteDtos = await listAllUserAssets(100);
    const remoteAssets = remoteDtos.map(userAssetDtoToAsset).filter((item): item is Asset => Boolean(item));
    const localAssets = useAssetStore.getState().assets;
    const merged = mergeAssets(localAssets, remoteAssets);
    const resolved = await Promise.all(
      merged.map(async (asset) => {
        if (asset.kind === "image" && asset.data.storageKey && !isDurableUrl(asset.data.dataUrl)) {
          const dataUrl = await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl);
          return {
            ...asset,
            coverUrl: asset.coverUrl.startsWith("blob:") || !asset.coverUrl ? dataUrl : asset.coverUrl,
            data: { ...asset.data, dataUrl },
          };
        }
        if (asset.kind === "video" && asset.data.storageKey && !isDurableUrl(asset.data.url)) {
          const url = await resolveMediaUrl(asset.data.storageKey, asset.data.url);
          return { ...asset, data: { ...asset.data, url } };
        }
        return asset;
      }),
    );
    useAssetStore.getState().replaceAssets(resolved);

    const remoteIds = new Set(remoteAssets.map((item) => item.id));
    for (const asset of resolved) {
      // Push local-only or newer local rows so other devices can see them.
      if (!remoteIds.has(asset.id) || toUnixSeconds(asset.updatedAt) > toUnixSeconds(remoteAssets.find((r) => r.id === asset.id)?.updatedAt)) {
        syncUserAsset(asset);
        continue;
      }
      // Re-upload blob-only videos/images so admin/other devices get https URLs.
      if (asset.kind === "video" && !isDurableUrl(asset.data.url) && (asset.data.storageKey || asset.data.url)) {
        syncUserAsset(asset);
      } else if (asset.kind === "image" && !isDurableUrl(asset.data.dataUrl) && !isDurableUrl(asset.coverUrl) && (asset.data.storageKey || asset.data.dataUrl)) {
        syncUserAsset(asset);
      }
    }
  })().finally(() => {
    hydratePromise = null;
  });
  return hydratePromise;
}
