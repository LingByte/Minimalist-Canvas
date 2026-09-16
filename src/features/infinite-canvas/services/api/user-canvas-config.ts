import { api } from "@/lib/api";
import type { AiConfig, WebdavSyncConfig } from "@canvas/stores/use-config-store";

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

export type UserCanvasConfigBlob = {
  config: AiConfig;
  webdav: WebdavSyncConfig;
};

export type UserCanvasConfigResponse = {
  exists: boolean;
  config: UserCanvasConfigBlob | null;
  updated_at?: number;
};

export async function fetchUserCanvasConfig(): Promise<UserCanvasConfigResponse> {
  try {
    const res = await api.get<ApiEnvelope<UserCanvasConfigResponse>>("/api/user-canvas-config/", {
      skipErrorHandler: true,
    });
    if (!res.data?.success || !res.data.data) {
      return { exists: false, config: null };
    }
    return res.data.data;
  } catch {
    return { exists: false, config: null };
  }
}

export async function putUserCanvasConfig(
  payload: UserCanvasConfigBlob,
): Promise<UserCanvasConfigResponse | null> {
  try {
    const res = await api.put<ApiEnvelope<UserCanvasConfigResponse>>(
      "/api/user-canvas-config/",
      { config: payload },
      { skipErrorHandler: true },
    );
    if (!res.data?.success || !res.data.data) return null;
    return res.data.data;
  } catch {
    return null;
  }
}
