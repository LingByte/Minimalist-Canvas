export type ObjectStorageProvider =
    | "cos"
    | "kodo"
    | "ks3"
    | "minio"
    | "obs"
    | "oss"
    | "s3"
    | "tos";

export type ObjectStorageConfig = {
    enabled: boolean;
    provider: ObjectStorageProvider;
    /** Custom or provider-default API endpoint (no trailing slash). */
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Optional CDN / custom domain used for public access URLs. */
    publicBaseUrl: string;
    /** Object key prefix, e.g. canvas/ */
    pathPrefix: string;
    /** Override path-style addressing; empty = provider default. */
    forcePathStyle: boolean | null;
    /** Attach x-amz-acl: public-read so AI providers can fetch references. */
    publicRead: boolean;
};

export const OBJECT_STORAGE_PROVIDERS: ObjectStorageProvider[] = [
    "cos",
    "kodo",
    "ks3",
    "minio",
    "obs",
    "oss",
    "s3",
    "tos",
];

export const defaultObjectStorageConfig: ObjectStorageConfig = {
    enabled: false,
    provider: "s3",
    endpoint: "",
    region: "",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    publicBaseUrl: "",
    pathPrefix: "canvas/",
    forcePathStyle: null,
    // Default off: AWS S3 "Bucket owner enforced" rejects x-amz-acl.
    // Prefer bucket policy / CDN public read, or turn this on for MinIO etc.
    publicRead: false,
};

export function isObjectStorageConfigured(config: ObjectStorageConfig) {
    if (!config.enabled) return false;
    if (!config.bucket.trim() || !config.accessKeyId.trim() || !config.secretAccessKey.trim()) return false;
    if (config.provider === "minio" && !config.endpoint.trim()) return false;
    if (config.provider !== "minio" && !config.region.trim() && !config.endpoint.trim()) return false;
    return true;
}
