import { api } from "@/lib/api";

export type GenerationAssetKind = "image" | "video";
export type GenerationAssetSource = "workbench" | "canvas" | "api";
export type GenerationAssetStatus = "pending" | "success" | "failed";

export type GenerationAssetFile = {
  url?: string;
  backup_url?: string;
  upstream_url?: string;
  storage_key?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  bytes?: number;
  duration_ms?: number;
  mirror_stage?: string;
  mirror_error?: string;
};

export type GenerationAsset = {
  id: number;
  user_id: number;
  client_id?: string;
  kind: GenerationAssetKind;
  source: GenerationAssetSource;
  title: string;
  prompt: string;
  model: string;
  status: GenerationAssetStatus;
  task_id?: string;
  error?: string;
  config: Record<string, unknown>;
  assets: GenerationAssetFile[];
  created_at: number;
  updated_at: number;
};

export type UpsertGenerationAssetInput = {
  client_id?: string;
  kind: GenerationAssetKind;
  source?: GenerationAssetSource;
  title?: string;
  prompt?: string;
  model?: string;
  status?: GenerationAssetStatus;
  task_id?: string;
  error?: string;
  config?: Record<string, unknown>;
  assets?: GenerationAssetFile[];
  /** One id per canvas/workbench click. Sent as a header, not stored in the body. */
  attempt_id?: string;
};

export type RunCanvasImageJobInput = {
  client_id: string;
  prompt: string;
  model: string;
  title?: string;
  base_url: string;
  api_key: string;
  mode?: "generation" | "edit";
  size?: string;
  quality?: string;
  background?: string;
  references?: string[];
  attempt_id?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export type GenerationAssetPage = {
  items: GenerationAsset[];
  next_cursor: string;
  has_more: boolean;
};

function attemptHeaders(attemptId?: string) {
  const value = attemptId?.trim() || "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(value)) return undefined;
  return { "X-Generation-Attempt-Id": value };
}

function isDurableUrl(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function isClientTransportError(message?: string) {
  const value = message?.trim() || "";
  return (
    value.includes("网络请求失败，请检查网络后刷新一下试试") ||
    value.includes("Network request failed. Check your connection and provider URL") ||
    value.includes("network request failed") ||
    value.includes("Failed to fetch") ||
    value.includes("Network Error")
  );
}

/** Persist a workbench/canvas generation result to the backend (best-effort). */
export async function upsertGenerationAsset(input: UpsertGenerationAssetInput): Promise<GenerationAsset | null> {
  // No HTTP response from this gateway is not an upstream failure. Leave the earlier pending row.
  if (input.status === "failed" && isClientTransportError(input.error)) {
    return null;
  }
  const assets = (input.assets || [])
    .map((item) => ({
      url: isDurableUrl(item.url) ? item.url : undefined,
      storage_key: item.storage_key || undefined,
      mime_type: item.mime_type || undefined,
      width: item.width || undefined,
      height: item.height || undefined,
      bytes: item.bytes || undefined,
      duration_ms: item.duration_ms || undefined,
    }))
    .filter((item) => item.url || item.storage_key);

  // Keep pending/failed rows and success rows that still have a task id (video).
  // Success without durable URL or task is skipped — nothing downloadable yet.
  if (input.status === "success" && assets.length === 0 && !input.task_id) {
    return null;
  }

  try {
    const res = await api.post<ApiEnvelope<GenerationAsset>>(
      "/api/generation-assets/",
      {
        client_id: input.client_id,
        kind: input.kind,
        source: input.source || "workbench",
        title: input.title || "",
        prompt: input.prompt || "",
        model: input.model || "",
        status: input.status || "success",
        task_id: input.task_id || "",
        error: input.error || "",
        config: input.config || {},
        assets,
      },
      { skipErrorHandler: true, headers: attemptHeaders(input.attempt_id) },
    );
    if (!res.data?.success || !res.data.data) return null;
    return res.data.data;
  } catch {
    return null;
  }
}

/** Start a recoverable canvas image job (server runs the sync image call). */
export async function runCanvasImageJob(input: RunCanvasImageJobInput): Promise<GenerationAsset | null> {
  try {
    const res = await api.post<ApiEnvelope<GenerationAsset>>(
      "/api/generation-assets/run-image",
      {
        client_id: input.client_id,
        prompt: input.prompt,
        model: input.model,
        title: input.title || "",
        base_url: input.base_url,
        api_key: input.api_key,
        mode: input.mode || "generation",
        size: input.size || "",
        quality: input.quality || "",
        background: input.background || "",
        references: input.references || [],
      },
      { skipErrorHandler: true, headers: attemptHeaders(input.attempt_id) },
    );
    if (!res.data?.success || !res.data.data) return null;
    return res.data.data;
  } catch {
    return null;
  }
}

export async function listGenerationAssets(params?: {
  kind?: GenerationAssetKind;
  source?: GenerationAssetSource;
  status?: GenerationAssetStatus;
  keyword?: string;
  cursor?: string;
  limit?: number;
}): Promise<GenerationAssetPage> {
  const query = new URLSearchParams();
  if (params?.kind) query.set("kind", params.kind);
  if (params?.source) query.set("source", params.source);
  if (params?.status) query.set("status", params.status);
  if (params?.keyword) query.set("keyword", params.keyword);
  if (params?.cursor) query.set("cursor", params.cursor);
  query.set("limit", String(params?.limit || 10));
  const res = await api.get<ApiEnvelope<GenerationAssetPage>>(`/api/generation-assets/?${query.toString()}`, {
    skipErrorHandler: true,
  });
  return (
    res.data?.data || {
      items: [],
      next_cursor: "",
      has_more: false,
    }
  );
}

export async function getGenerationAssetByClientId(clientId: string): Promise<GenerationAsset | null> {
  const id = clientId.trim();
  if (!id) return null;
  try {
    const res = await api.get<ApiEnvelope<GenerationAsset>>(
      `/api/generation-assets/by-client-id/${encodeURIComponent(id)}`,
      { skipErrorHandler: true },
    );
    if (!res.data?.success || !res.data.data) return null;
    return res.data.data;
  } catch {
    return null;
  }
}

export async function deleteGenerationAssetsByClientIds(clientIds: string[]): Promise<number> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return 0;
  try {
    const res = await api.post<ApiEnvelope<{ deleted?: number }>>(
      "/api/generation-assets/batch-delete-by-client-id",
      { client_ids: ids },
      { skipErrorHandler: true },
    );
    return Number(res.data?.data?.deleted || 0);
  } catch {
    return 0;
  }
}

export async function deleteGenerationAsset(id: number): Promise<boolean> {
  try {
    const res = await api.delete<ApiEnvelope<unknown>>(`/api/generation-assets/${id}`, {
      skipErrorHandler: true,
    });
    return Boolean(res.data?.success);
  } catch {
    return false;
  }
}
