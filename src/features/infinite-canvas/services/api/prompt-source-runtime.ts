import { isTauri } from "@canvas/services/fs-store";

import { isBuiltinPromptSourceUrl, listBuiltinPromptTemplates } from "./builtin-prompt-templates";
import type { PromptSource } from "./prompt-source-presets";

export type RawPrompt = {
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
};

type RunOptions = { signal?: AbortSignal };

const ARRAY_WRAPPER_KEYS = ["prompts", "items", "data", "records", "list"] as const;

async function fetchSource(source: PromptSource, options?: RunOptions) {
    // Desktop: plugin-http bypasses webview CORS so GitHub raw JSON can load.
    const response = isTauri()
        ? await (await import("@tauri-apps/plugin-http")).fetch(source.url, {
              method: "GET",
              signal: options?.signal,
          })
        : await fetch(source.url, { cache: "no-store", signal: options?.signal });
    if (!response.ok) throw new Error(`请求失败（${response.status}）`);
    return response.json();
}

export async function runPromptSource(source: PromptSource, options?: RunOptions): Promise<RawPrompt[]> {
    const url = source.url.trim();
    if (!url) throw new Error("JSON URL 不能为空");
    if (isBuiltinPromptSourceUrl(url)) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const items = listBuiltinPromptTemplates();
        if (!items.length) throw new Error(`「${source.name}」未解析到有效提示词`);
        return items;
    }
    if (!/^https?:\/\//i.test(url)) {
        throw new Error(`「${source.name}」来源地址无效，仅支持 http(s) 或 builtin://`);
    }
    let data: unknown;
    try {
        data = await fetchSource(source, options);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new Error(`「${source.name}」拉取失败：${error instanceof Error ? error.message : String(error)}`);
    }

    const items = parseJsonSource(data, source);
    if (source.builtIn && !items.length) throw new Error(`「${source.name}」未解析到有效提示词`);
    return items;
}

function parseJsonSource(data: unknown, source: PromptSource) {
    const rows = unwrapPromptRows(data);
    if (!rows) throw new Error(`「${source.name}」格式错误：根节点必须是数组或含 prompts/items 的对象`);
    return normalizeItems(rows, source);
}

function unwrapPromptRows(data: unknown): unknown[] | null {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    for (const key of ARRAY_WRAPPER_KEYS) {
        const value = record[key];
        if (Array.isArray(value)) return value;
    }
    return null;
}

function normalizeItems(values: unknown[], source: PromptSource) {
    const seen = new Set<string>();
    const items: RawPrompt[] = [];
    values.forEach((value, index) => {
        const record = asRecord(value);
        const title = firstString(record, ["title", "title_en", "title_zh", "name", "slug"]).trim();
        const prompt = firstString(record, ["prompt", "prompt_template", "prompt_example", "content", "prompt_zh", "prompt_en"]).trim();
        if (!title || !prompt) return;
        const id = firstString(record, ["id", "slug"]).trim() || `${source.id}-${leftPad(index + 1)}`;
        if (seen.has(id)) return;
        seen.add(id);

        const imageCandidates = [
            ...stringArray(record.referenceImageUrls),
            ...stringArray(record.referenceImages),
            ...stringArray(record.images),
            ...stringArray(record.media),
            ...stringArray(record.mediaThumbnails),
            firstString(record, ["coverUrl", "cover", "coverImage", "image_url", "imageUrl", "image"]),
        ]
            .map((url) => absoluteUrl(source.url, url))
            .filter(Boolean);
        const referenceImageUrls = unique(imageCandidates);
        const coverUrl = referenceImageUrls[0] || "";
        const tags = unique([
            ...stringArray(record.tags),
            ...stringArray(record.categories),
            ...stringArray(record.promptCategories),
            ...stringArray(record.styles),
            ...stringArray(record.category),
            ...stringArray(record.style),
        ]);

        items.push({
            id,
            title,
            prompt,
            description: firstString(record, ["description", "image_alt", "preview"]).trim(),
            coverUrl,
            referenceImageUrls,
            tags,
            preview: stringValue(record.preview),
            createdAt: firstString(record, ["createdAt", "created_at", "sourcePublishedAt", "rendered_at"]),
            updatedAt: firstString(record, ["updatedAt", "updated_at"]),
            author: authorValue(record.author) || optionalString(record.author_name),
            sourceUrl: absoluteUrl(
                source.url,
                firstString(record, ["sourceUrl", "source_url", "url", "sourceLink", "authorUrl", "author_url"]),
            ) || undefined,
            imageMode: optionalString(record.imageMode) || optionalString(record.inputMode) || optionalString(record.taskType),
            imageModel: optionalString(record.imageModel) || optionalString(record.model),
            imageSize: optionalString(record.imageSize) || optionalString(record.aspect),
            imageCount: optionalNumber(record.imageCount) || optionalNumber(record.referenceImageCount),
        });
    });
    return items;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = stringValue(record[key]).trim();
        if (value) return value;
    }
    return "";
}

function stringValue(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function stringArray(value: unknown) {
    if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        return text ? [text] : [];
    }
    if (!Array.isArray(value)) return [];
    return value
        .flatMap((item) => {
            if (typeof item === "string" || typeof item === "number") return [String(item)];
            if (item && typeof item === "object") {
                const record = item as Record<string, unknown>;
                return [firstString(record, ["url", "src", "href", "image", "image_url", "cover"])].filter(Boolean);
            }
            return [];
        })
        .map((item) => item.trim())
        .filter(Boolean);
}

function authorValue(value: unknown) {
    if (typeof value === "string" || typeof value === "number") return String(value).trim() || undefined;
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    return firstString(record, ["name", "handle", "username", "author"]) || undefined;
}

function optionalString(value: unknown) {
    const result = stringValue(value).trim();
    return result || undefined;
}

function optionalNumber(value: unknown) {
    const result = Number(value);
    return Number.isFinite(result) && result > 0 ? result : undefined;
}

function unique(values: string[]) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const next = value.trim();
        if (!next || seen.has(next)) continue;
        seen.add(next);
        result.push(next);
    }
    return result;
}

function absoluteUrl(baseUrl: string, path: string) {
    if (!path) return "";
    if (/^(https?:|data:)/i.test(path)) return path;
    try {
        const base = new URL(baseUrl);
        if (base.hostname === "raw.githubusercontent.com") {
            const parts = base.pathname.split("/").filter(Boolean);
            if (parts.length >= 3) {
                const [owner, repo, branch] = parts;
                return new URL(path.replace(/^\//, ""), `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`).toString();
            }
        }
        return new URL(path, baseUrl).toString();
    } catch {
        return path;
    }
}

function leftPad(value: number) {
    return String(value).padStart(4, "0");
}
