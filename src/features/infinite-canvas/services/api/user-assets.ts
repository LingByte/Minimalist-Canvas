import { api } from "@/lib/api";

export type UserAssetKind = "text" | "image" | "video";

export type UserAssetDTO = {
  id: number;
  user_id: number;
  client_id?: string;
  kind: UserAssetKind;
  title: string;
  cover_url: string;
  tags: string[];
  source?: string;
  note?: string;
  content?: string;
  media_url?: string;
  storage_key?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  bytes?: number;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

export type UpsertUserAssetInput = {
  client_id?: string;
  kind: UserAssetKind;
  title?: string;
  cover_url?: string;
  tags?: string[];
  source?: string;
  note?: string;
  content?: string;
  media_url?: string;
  storage_key?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  bytes?: number;
  metadata?: Record<string, unknown>;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type PageData<T> = {
  page: number;
  page_size: number;
  total: number;
  items: T[];
};

function isDurableUrl(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function pixelInt(value?: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), 2_147_483_647);
}

const silentRequest = { skipErrorHandler: true, skipBusinessError: true } as const;

/** Persist a reusable library asset to the backend (best-effort). */
export async function upsertUserAsset(input: UpsertUserAssetInput): Promise<UserAssetDTO | null> {
  const mediaUrl = isDurableUrl(input.media_url) ? input.media_url : "";
  const coverUrl = isDurableUrl(input.cover_url) ? input.cover_url : "";
  const storageKey = (input.storage_key || "").trim();

  if (input.kind === "text") {
    if (!(input.content || "").trim()) return null;
  } else if (!mediaUrl && !storageKey) {
    return null;
  }

  try {
    const res = await api.post<ApiEnvelope<UserAssetDTO>>(
      "/api/user-assets/",
      {
        client_id: input.client_id || "",
        kind: input.kind,
        title: input.title || "",
        cover_url: coverUrl,
        tags: input.tags || [],
        source: input.source || "",
        note: input.note || "",
        content: input.content || "",
        media_url: mediaUrl,
        storage_key: storageKey,
        mime_type: input.mime_type || "",
        width: pixelInt(input.width),
        height: pixelInt(input.height),
        bytes: Math.max(0, Math.floor(Number(input.bytes) || 0)),
        metadata: input.metadata || {},
      },
      silentRequest,
    );
    if (!res.data?.success || !res.data.data) return null;
    return res.data.data;
  } catch {
    return null;
  }
}

export async function listUserAssets(params?: {
  kind?: UserAssetKind;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PageData<UserAssetDTO>> {
  const query = new URLSearchParams();
  if (params?.kind) query.set("kind", params.kind);
  if (params?.keyword) query.set("keyword", params.keyword);
  if (params?.page) query.set("p", String(params.page));
  if (params?.pageSize) query.set("page_size", String(params.pageSize));
  try {
    const res = await api.get<ApiEnvelope<PageData<UserAssetDTO>>>(`/api/user-assets/?${query.toString()}`, silentRequest);
    return (
      res.data?.data || {
        page: params?.page || 1,
        page_size: params?.pageSize || 50,
        total: 0,
        items: [],
      }
    );
  } catch {
    return {
      page: params?.page || 1,
      page_size: params?.pageSize || 50,
      total: 0,
      items: [],
    };
  }
}

/** Fetch all pages of the current user's assets. */
export async function listAllUserAssets(pageSize = 100): Promise<UserAssetDTO[]> {
  const size = Math.min(Math.max(pageSize, 1), 200);
  const first = await listUserAssets({ page: 1, pageSize: size });
  const items = [...(first.items || [])];
  const total = Number(first.total || 0);
  const pages = Math.max(1, Math.ceil(total / size));
  for (let page = 2; page <= pages; page += 1) {
    const next = await listUserAssets({ page, pageSize: size });
    items.push(...(next.items || []));
  }
  return items;
}

export async function deleteUserAssetsByClientIds(clientIds: string[]): Promise<number> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return 0;
  try {
    const res = await api.post<ApiEnvelope<{ deleted?: number }>>(
      "/api/user-assets/batch-delete-by-client-id",
      { client_ids: ids },
      silentRequest,
    );
    return Number(res.data?.data?.deleted || 0);
  } catch {
    return 0;
  }
}
