/** Minimal AWS Signature V4 for S3-compatible PUT (UNSIGNED-PAYLOAD). */

const encoder = new TextEncoder();

async function sha256Hex(data: BufferSource | string) {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return bufferToHex(digest);
}

async function hmac(key: BufferSource, data: string) {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function bufferToHex(buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
    const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, "aws4_request");
}

function amzDateNow() {
    const now = new Date();
    const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export type SignS3RequestInput = {
    method: string;
    url: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    headers?: Record<string, string>;
    /** Extra signed headers such as x-amz-acl. */
    extraHeaders?: Record<string, string>;
};

/** Encode a path the way SigV4 expects: encode each segment, keep `/`. */
export function canonicalUriPath(pathname: string) {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return path
        .split("/")
        .map((segment) => {
            if (!segment) return "";
            // Decode first so we never double-encode already-encoded upload URLs.
            try {
                return encodeURIComponent(decodeURIComponent(segment));
            } catch {
                return encodeURIComponent(segment);
            }
        })
        .join("/");
}

export async function signS3Request(input: SignS3RequestInput) {
    const url = new URL(input.url);
    const { amzDate, dateStamp } = amzDateNow();
    const payloadHash = "UNSIGNED-PAYLOAD";
    // Normalize header names to lowercase up front so SignedHeaders matches the map keys.
    const headers: Record<string, string> = {};
    const assign = (key: string, value: string) => {
        headers[key.toLowerCase()] = value;
    };
    assign("host", url.host);
    assign("x-amz-content-sha256", payloadHash);
    assign("x-amz-date", amzDate);
    for (const [key, value] of Object.entries(input.headers || {})) assign(key, value);
    for (const [key, value] of Object.entries(input.extraHeaders || {})) assign(key, value);

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim().replace(/\s+/g, " ")}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");

    const canonicalQuery = [...url.searchParams.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${uriEncode(key)}=${uriEncode(value)}`)
        .join("&");

    const canonicalRequest = [
        input.method.toUpperCase(),
        canonicalUriPath(url.pathname || "/"),
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
    const signingKey = await getSigningKey(input.secretAccessKey, dateStamp, input.region, "s3");
    const signature = bufferToHex(await hmac(signingKey, stringToSign));

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
}

function uriEncode(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
