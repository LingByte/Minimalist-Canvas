import { api } from "@/lib/api";

import type { PromptSource } from "./prompt-source-presets";
import { createPromptSource } from "./prompt-source-presets";

export type Prompt = {
  id: string;
  title: string;
  prompt: string;
  description: string;
  coverUrl: string;
  referenceImageUrls: string[];
  tags: string[];
  preview: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  sourceUrl?: string;
  imageMode?: string;
  imageModel?: string;
  imageSize?: string;
  imageCount?: number;
  sourceId: string;
  category: string;
  githubUrl: string;
};

export const ALL_PROMPTS_OPTION = "all";

export type PromptListResponse = {
  items: Prompt[];
  tags: string[];
  categories: string[];
  total: number;
};

export type SourcePromptPage = {
  items: Prompt[];
  nextCursor: string;
  total: number;
};

export type PromptSourceStatus = {
  sourceId: string;
  count: number;
  lastSuccessAt: string;
  lastError: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

function unwrap<T>(res: { data?: ApiEnvelope<T> }, fallbackMessage: string): T {
  const body = res.data;
  if (!body?.success || body.data === undefined) {
    throw new Error(body?.message || fallbackMessage);
  }
  return body.data;
}

export async function fetchPromptSources(): Promise<PromptSource[]> {
  const res = await api.get<ApiEnvelope<{ items: PromptSource[]; total: number }>>("/api/prompts/sources", {
    skipErrorHandler: true,
  });
  const data = unwrap(res, "failed to load prompt sources");
  return (data.items || []).map((item) =>
    createPromptSource({
      id: item.id,
      name: item.name,
      url: item.url,
      homepage: item.homepage,
      enabled: item.enabled,
      builtIn: item.builtIn,
    })
  );
}

export async function createPromptSourceRemote(source: PromptSource): Promise<PromptSource> {
  const res = await api.post<ApiEnvelope<PromptSource>>(
    "/api/prompts/sources",
    {
      id: source.id,
      name: source.name,
      url: source.url,
      homepage: source.homepage,
      enabled: source.enabled,
    },
    { skipErrorHandler: true }
  );
  const item = unwrap(res, "failed to create prompt source");
  return createPromptSource(item);
}

export async function updatePromptSourceRemote(source: PromptSource): Promise<PromptSource> {
  const res = await api.put<ApiEnvelope<PromptSource>>(
    `/api/prompts/sources/${encodeURIComponent(source.id)}`,
    {
      name: source.name,
      url: source.url,
      homepage: source.homepage,
      enabled: source.enabled,
    },
    { skipErrorHandler: true }
  );
  const item = unwrap(res, "failed to update prompt source");
  return createPromptSource({ ...source, ...item, id: item.id || source.id });
}

export async function setPromptSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>(
    `/api/prompts/sources/${encodeURIComponent(sourceId)}`,
    { enabled },
    { skipErrorHandler: true }
  );
  unwrap(res, "failed to update prompt source");
}

export async function deletePromptSourceRemote(sourceId: string): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(`/api/prompts/sources/${encodeURIComponent(sourceId)}`, {
    skipErrorHandler: true,
  });
  unwrap(res, "failed to delete prompt source");
}

export async function fetchPrompts({
  keyword = "",
  tag = [],
  category = ALL_PROMPTS_OPTION,
  page = 1,
  pageSize = 20,
}: {
  keyword?: string;
  tag?: string[];
  category?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PromptListResponse> {
  const params = new URLSearchParams();
  params.set("p", String(Math.max(1, page)));
  params.set("page_size", String(Math.max(1, Math.min(100, pageSize))));
  if (keyword.trim()) params.set("keyword", keyword.trim());
  if (category && category !== ALL_PROMPTS_OPTION && category !== "all") params.set("category", category);
  for (const item of tag) {
    if (item.trim()) params.append("tag", item.trim());
  }
  const res = await api.get<ApiEnvelope<PromptListResponse>>(`/api/prompts/?${params.toString()}`, {
    skipErrorHandler: true,
  });
  const data = unwrap(res, "failed to load prompts");
  return {
    items: (data.items || []).map(normalizePrompt),
    tags: data.tags || [],
    categories: data.categories || [],
    total: data.total || 0,
  };
}

export async function fetchSourcePrompts(
  sourceId: string,
  {
    keyword = "",
    cursor = "",
    limit = 20,
  }: {
    keyword?: string;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<SourcePromptPage> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.max(1, Math.min(100, limit))));
  if (keyword.trim()) params.set("keyword", keyword.trim());
  if (cursor.trim()) params.set("cursor", cursor.trim());
  const res = await api.get<ApiEnvelope<SourcePromptPage>>(
    `/api/prompts/by-source/${encodeURIComponent(sourceId)}?${params.toString()}`,
    { skipErrorHandler: true }
  );
  const data = unwrap(res, "failed to load source prompts");
  return {
    items: (data.items || []).map(normalizePrompt),
    nextCursor: data.nextCursor || "",
    total: data.total || 0,
  };
}

/** Loads every page for admin/content views that still need the full source list. */
export async function fetchAllSourcePrompts(sourceId: string): Promise<Prompt[]> {
  const items: Prompt[] = [];
  let cursor = "";
  for (;;) {
    const page = await fetchSourcePrompts(sourceId, { cursor, limit: 100 });
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
}

export async function fetchPromptSourceStatuses(): Promise<Record<string, PromptSourceStatus>> {
  const res = await api.get<ApiEnvelope<Record<string, PromptSourceStatus>>>("/api/prompts/sources/statuses", {
    skipErrorHandler: true,
  });
  return unwrap(res, "failed to load source statuses") || {};
}

function normalizePrompt(item: Prompt): Prompt {
  return {
    ...item,
    description: item.description || "",
    referenceImageUrls: Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
    preview: item.preview || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || "",
    coverUrl: item.coverUrl || "",
    githubUrl: item.githubUrl || "",
    category: item.category || "",
    sourceId: item.sourceId || "",
  };
}

export function formatPromptDate(value: string, locale?: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
