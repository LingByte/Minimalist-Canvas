import i18n from "@canvas/i18n";
import {
  getGenerationAssetByClientId,
  runCanvasImageJob,
  type GenerationAsset,
} from "@canvas/services/api/generation-assets";
import { requestEdit, requestGeneration } from "@canvas/services/api/image";
import { uploadImage, type UploadedImage } from "@canvas/services/image-storage";
import { isContractImageModel } from "@canvas/lib/contract-image";
import {
  resolveModelRequestConfig,
  resolveModelScript,
  type AiConfig,
} from "@canvas/stores/use-config-store";
import type { ReferenceImage } from "@canvas/types/image";

export const IMAGE_JOB_POLL_INTERVAL_MS = 2000;
export const IMAGE_JOB_POLL_MAX_ATTEMPTS = 300; // ~10 minutes

export function canUseServerImageJob(config: AiConfig, model = config.imageModel || config.model) {
  const requestConfig = resolveModelRequestConfig(config, model);
  if (resolveModelScript(config, model)) return false;
  if (requestConfig.apiFormat === "gemini") return false;
  if (isContractImageModel(requestConfig.model)) return false;
  if (!requestConfig.baseUrl?.trim() || !requestConfig.apiKey?.trim()) return false;
  return true;
}

async function durableReferenceUrls(references: ReferenceImage[]) {
  const urls: string[] = [];
  for (const reference of references) {
    const existing = (reference.url || reference.dataUrl || "").trim();
    if (/^https?:\/\//i.test(existing)) {
      urls.push(existing);
      continue;
    }
    const source = reference.dataUrl || reference.url;
    if (!source) continue;
    const uploaded = await uploadImage(source);
    if (/^https?:\/\//i.test(uploaded.url)) urls.push(uploaded.url);
  }
  return urls;
}

export async function startRecoverableImageJob(options: {
  clientId: string;
  config: AiConfig;
  prompt: string;
  mode: "generation" | "edit";
  references?: ReferenceImage[];
}): Promise<GenerationAsset | null> {
  const model = options.config.imageModel || options.config.model;
  if (!canUseServerImageJob(options.config, model)) return null;
  const requestConfig = resolveModelRequestConfig(options.config, model);
  const references =
    options.mode === "edit" ? await durableReferenceUrls(options.references || []) : [];
  if (options.mode === "edit" && !references.length) return null;

  return runCanvasImageJob({
    client_id: options.clientId,
    prompt: options.prompt,
    model: requestConfig.model,
    title: requestConfig.model,
    base_url: requestConfig.baseUrl,
    api_key: requestConfig.apiKey,
    mode: options.mode,
    size: options.config.size,
    quality: options.config.quality,
    background: options.config.background,
    references,
  });
}

export async function waitForGenerationAsset(
  clientId: string,
  options?: { signal?: AbortSignal; intervalMs?: number; maxAttempts?: number },
): Promise<GenerationAsset> {
  const intervalMs = options?.intervalMs ?? IMAGE_JOB_POLL_INTERVAL_MS;
  const maxAttempts = options?.maxAttempts ?? IMAGE_JOB_POLL_MAX_ATTEMPTS;
  let lastError = i18n.t("canvas.projectPage.imageJobTimeout");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options?.signal?.aborted) {
      throw new DOMException(i18n.t("apiErrors.requestCanceled"), "AbortError");
    }
    const asset = await getGenerationAssetByClientId(clientId);
    if (!asset) {
      lastError = i18n.t("canvas.projectPage.imageJobMissing");
    } else if (asset.status === "success") {
      if (!asset.assets?.some((item) => item.url || item.storage_key)) {
        throw new Error(i18n.t("canvas.projectPage.imageJobEmpty"));
      }
      return asset;
    } else if (asset.status === "failed") {
      throw new Error(asset.error?.trim() || i18n.t("canvas.projectPage.generationFailed"));
    }
    await sleep(intervalMs, options?.signal);
  }
  throw new Error(lastError);
}

/** Prefer server job (refresh-safe); fall back to direct browser request. */
export async function generateCanvasImage(options: {
  clientId: string;
  config: AiConfig;
  prompt: string;
  mode: "generation" | "edit";
  references?: ReferenceImage[];
  signal?: AbortSignal;
  onServerJobStarted?: () => void;
}): Promise<{ uploaded: UploadedImage; usedServerJob: boolean }> {
  const job = await startRecoverableImageJob(options);
  if (job) {
    options.onServerJobStarted?.();
    const asset = await waitForGenerationAsset(options.clientId, { signal: options.signal });
    const url = asset.assets.find((item) => item.url)?.url;
    if (!url) throw new Error(i18n.t("canvas.projectPage.imageJobEmpty"));
    return { uploaded: await uploadImage(url), usedServerJob: true };
  }

  const image =
    options.mode === "edit"
      ? await requestEdit(
          { ...options.config, count: "1" },
          options.prompt,
          options.references || [],
          undefined,
          { signal: options.signal },
        ).then((items) => items[0])
      : await requestGeneration({ ...options.config, count: "1" }, options.prompt, {
          signal: options.signal,
        }).then((items) => items[0]);
  return { uploaded: await uploadImage(image.dataUrl), usedServerJob: false };
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException(i18n.t("apiErrors.requestCanceled"), "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException(i18n.t("apiErrors.requestCanceled"), "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
