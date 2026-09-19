import { kvStore, type KvStore } from "@canvas/services/fs-store";
import { hydrateUserAssetsFromServer } from "@canvas/services/user-asset-sync";
import { useAssetStore } from "@canvas/stores/use-asset-store";

const imageLogStore = kvStore("image_generation_logs");
const videoLogStore = kvStore("video_generation_logs");

export type ClearedSyncedLocalData = {
  imageLogs: number;
  videoLogs: number;
  assets: number;
};

async function countStore(store: KvStore) {
  let count = 0;
  await store.iterate(() => {
    count += 1;
  });
  return count;
}

/**
 * Clear local copies that already live in the backend:
 * - image/video generation history → generation_assets
 * - my assets metadata → user_assets
 *
 * Keeps canvas projects, config, and local media blobs (still needed offline / for nodes).
 */
export async function clearSyncedLocalData(): Promise<ClearedSyncedLocalData> {
  const [imageLogs, videoLogs, assets] = await Promise.all([
    countStore(imageLogStore),
    countStore(videoLogStore),
    Promise.resolve(useAssetStore.getState().assets.length),
  ]);

  await Promise.all([imageLogStore.clear(), videoLogStore.clear()]);
  useAssetStore.getState().replaceAssets([]);
  await hydrateUserAssetsFromServer().catch(() => undefined);

  return { imageLogs, videoLogs, assets };
}
