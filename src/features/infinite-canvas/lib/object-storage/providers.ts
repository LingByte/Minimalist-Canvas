import type { ObjectStorageConfig, ObjectStorageProvider } from "./types";

type ProviderMeta = {
    id: ObjectStorageProvider;
    /** i18n key suffix under config.objectStorage.providers.* */
    labelKey: string;
    /** Default forcePathStyle when config.forcePathStyle is null. */
    forcePathStyle: boolean;
    /** Whether region is required when endpoint is empty. */
    regionRequired: boolean;
    /** Build default API endpoint from region (no trailing slash). */
    defaultEndpoint: (region: string) => string;
    regionPlaceholder: string;
    endpointHintKey: string;
};

export const OBJECT_STORAGE_PROVIDER_META: Record<ObjectStorageProvider, ProviderMeta> = {
    cos: {
        id: "cos",
        labelKey: "cos",
        forcePathStyle: true,
        regionRequired: true,
        defaultEndpoint: (region) => `https://cos.${region}.myqcloud.com`,
        regionPlaceholder: "ap-guangzhou",
        endpointHintKey: "endpointHintCos",
    },
    kodo: {
        id: "kodo",
        labelKey: "kodo",
        forcePathStyle: true,
        regionRequired: true,
        // Official S3 endpoints use dots: s3.cn-south-1.qiniucs.com (not s3-huanan / s3-cn-south-1).
        // See https://developer.qiniu.com/kodo/4088/s3-access-domainname
        defaultEndpoint: (region) => `https://s3.${normalizeKodoRegion(region)}.qiniucs.com`,
        regionPlaceholder: "huanan",
        endpointHintKey: "endpointHintKodo",
    },
    ks3: {
        id: "ks3",
        labelKey: "ks3",
        forcePathStyle: true,
        regionRequired: true,
        defaultEndpoint: (region) => `https://ks3-${region}.ksyun.com`,
        regionPlaceholder: "beijing",
        endpointHintKey: "endpointHintKs3",
    },
    minio: {
        id: "minio",
        labelKey: "minio",
        forcePathStyle: true,
        regionRequired: false,
        defaultEndpoint: () => "",
        regionPlaceholder: "us-east-1",
        endpointHintKey: "endpointHintMinio",
    },
    obs: {
        id: "obs",
        labelKey: "obs",
        forcePathStyle: false,
        regionRequired: true,
        defaultEndpoint: (region) => `https://obs.${region}.myhuaweicloud.com`,
        regionPlaceholder: "cn-north-4",
        endpointHintKey: "endpointHintObs",
    },
    oss: {
        id: "oss",
        labelKey: "oss",
        forcePathStyle: false,
        regionRequired: true,
        // S3-compatible endpoint works with SigV4 from AWS-style clients.
        defaultEndpoint: (region) => `https://s3.oss-${region}.aliyuncs.com`,
        regionPlaceholder: "cn-hangzhou",
        endpointHintKey: "endpointHintOss",
    },
    s3: {
        id: "s3",
        labelKey: "s3",
        forcePathStyle: false,
        regionRequired: true,
        defaultEndpoint: (region) => `https://s3.${region}.amazonaws.com`,
        regionPlaceholder: "us-east-1",
        endpointHintKey: "endpointHintS3",
    },
    tos: {
        id: "tos",
        labelKey: "tos",
        forcePathStyle: false,
        regionRequired: true,
        defaultEndpoint: (region) => `https://tos-s3-${region}.volces.com`,
        regionPlaceholder: "cn-beijing",
        endpointHintKey: "endpointHintTos",
    },
};

/** Qiniu native region ids / nicknames → S3 Region ID. */
const KODO_REGION_ALIASES: Record<string, string> = {
    z0: "cn-east-1",
    huadong: "cn-east-1",
    "east-china": "cn-east-1",
    "cn-east-1": "cn-east-1",
    "cn-east-2": "cn-east-2",
    z1: "cn-north-1",
    huabei: "cn-north-1",
    "north-china": "cn-north-1",
    "cn-north-1": "cn-north-1",
    z2: "cn-south-1",
    huanan: "cn-south-1",
    "south-china": "cn-south-1",
    "cn-south-1": "cn-south-1",
    na0: "us-north-1",
    "us-north-1": "us-north-1",
    as0: "ap-southeast-1",
    "ap-southeast-1": "ap-southeast-1",
    "ap-southeast-2": "ap-southeast-2",
    "ap-southeast-3": "ap-southeast-3",
};

export const KODO_S3_REGIONS = [
    { id: "cn-east-1", endpoint: "https://s3.cn-east-1.qiniucs.com" },
    { id: "cn-east-2", endpoint: "https://s3.cn-east-2.qiniucs.com" },
    { id: "cn-north-1", endpoint: "https://s3.cn-north-1.qiniucs.com" },
    { id: "cn-south-1", endpoint: "https://s3.cn-south-1.qiniucs.com" },
    { id: "us-north-1", endpoint: "https://s3.us-north-1.qiniucs.com" },
    { id: "ap-southeast-1", endpoint: "https://s3.ap-southeast-1.qiniucs.com" },
    { id: "ap-southeast-2", endpoint: "https://s3.ap-southeast-2.qiniucs.com" },
    { id: "ap-southeast-3", endpoint: "https://s3.ap-southeast-3.qiniucs.com" },
] as const;

export function normalizeKodoRegion(region: string) {
    const key = region.trim().toLowerCase();
    return KODO_REGION_ALIASES[key] || region.trim();
}

/** Normalize legacy / mistaken Qiniu endpoints users may paste. */
export function normalizeKodoEndpoint(endpoint: string, region = "") {
    const trimmed = endpoint.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    try {
        const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
        const host = url.hostname.toLowerCase();
        // s3-huanan.qiniucs.com / s3-cn-south-1.qiniucs.com → s3.cn-south-1.qiniucs.com
        const dashed = host.match(/^s3-([a-z0-9-]+)\.qiniucs\.com$/i);
        if (dashed) {
            const mapped = normalizeKodoRegion(dashed[1]);
            url.hostname = `s3.${mapped}.qiniucs.com`;
            url.pathname = "/";
            url.search = "";
            url.hash = "";
            return url.toString().replace(/\/+$/, "");
        }
        const dotted = host.match(/^s3\.([a-z0-9-]+)\.qiniucs\.com$/i);
        if (dotted) {
            const mapped = normalizeKodoRegion(dotted[1]);
            url.hostname = `s3.${mapped}.qiniucs.com`;
            url.pathname = "/";
            url.search = "";
            url.hash = "";
            return url.toString().replace(/\/+$/, "");
        }
        return trimmed;
    } catch {
        if (region.trim()) {
            return `https://s3.${normalizeKodoRegion(region)}.qiniucs.com`;
        }
        return trimmed;
    }
}

export function resolveObjectStorageEndpoint(config: ObjectStorageConfig) {
    const trimmed = config.endpoint.trim().replace(/\/+$/, "");
    if (trimmed) {
        if (config.provider === "kodo") return normalizeKodoEndpoint(trimmed, config.region);
        return trimmed;
    }
    const region = config.region.trim();
    const meta = OBJECT_STORAGE_PROVIDER_META[config.provider];
    if (!region) return "";
    return meta.defaultEndpoint(region).replace(/\/+$/, "");
}

export function resolveForcePathStyle(config: ObjectStorageConfig) {
    if (typeof config.forcePathStyle === "boolean") return config.forcePathStyle;
    return OBJECT_STORAGE_PROVIDER_META[config.provider].forcePathStyle;
}

export function resolveSigningRegion(config: ObjectStorageConfig) {
    const region = config.region.trim();
    if (config.provider === "kodo") {
        if (region) return normalizeKodoRegion(region);
        // Infer from endpoint host when region field is empty / nickname-only in endpoint.
        const endpoint = resolveObjectStorageEndpoint(config);
        const match = endpoint.match(/s3\.([a-z0-9-]+)\.qiniucs\.com/i);
        if (match) return normalizeKodoRegion(match[1]);
        return "cn-east-1";
    }
    if (region) return region;
    // MinIO and custom endpoints often accept a placeholder region.
    return "us-east-1";
}

export function normalizePathPrefix(prefix: string) {
    const cleaned = prefix.trim().replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    if (!cleaned) return "";
    return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

export function buildObjectKey(prefix: string, filename: string) {
    const safeName = filename.replace(/[\\/]+/g, "_").replace(/[^\w.\-()+@]+/g, "_") || "file.bin";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const rand = Math.random().toString(36).slice(2, 10);
    return `${normalizePathPrefix(prefix)}${stamp}-${rand}-${safeName}`;
}

export function buildObjectAccessUrl(config: ObjectStorageConfig, key: string) {
    const publicBase = config.publicBaseUrl.trim().replace(/\/+$/, "");
    const normalizedKey = key.replace(/^\/+/, "");
    if (publicBase) {
        return `${publicBase}/${normalizedKey
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`;
    }

    // Same host/path rules as the upload URL so AI providers can fetch what we wrote.
    return buildObjectUploadUrl(config, normalizedKey);
}

export function buildObjectUploadUrl(config: ObjectStorageConfig, key: string) {
    const endpoint = resolveObjectStorageEndpoint(config);
    if (!endpoint) throw new Error("Object storage endpoint is missing");
    const bucket = config.bucket.trim();
    const encodedKey = key
        .split("/")
        .filter(Boolean)
        .map((part) => encodeURIComponent(part))
        .join("/");

    if (resolveForcePathStyle(config)) {
        // Keep bucket literal for typical ASCII names; only encode reserved chars.
        return `${endpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
    }

    const url = new URL(endpoint);
    // Avoid doubling the bucket when the user already pasted a virtual-hosted endpoint.
    const host = url.hostname.toLowerCase();
    const bucketHost = `${bucket}.`.toLowerCase();
    if (!host.startsWith(bucketHost)) {
        url.hostname = `${bucket}.${url.hostname}`;
    }
    url.pathname = `/${encodedKey}`;
    url.search = "";
    url.hash = "";
    return url.toString();
}

/** Public base used for ownership checks / UI (CDN or endpoint root). */
export function resolveObjectStoragePublicBase(config: ObjectStorageConfig) {
    const publicBase = config.publicBaseUrl.trim().replace(/\/+$/, "");
    if (publicBase) return publicBase;
    try {
        // Derive from a synthetic key so virtual-hosted / path-style matches upload URLs.
        return buildObjectUploadUrl(config, ".__base__").replace(/\/\.__base__$/, "");
    } catch {
        return resolveObjectStorageEndpoint(config);
    }
}
