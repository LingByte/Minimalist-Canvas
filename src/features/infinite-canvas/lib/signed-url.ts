const COS_SIGN_TIME = /[?&]q-(?:sign|key)-time=\d+(?:%3B|;)(\d+)/i;
const QINIU_EXPIRES = /[?&]e=(\d{9,})(?:&|$)/i;
const GENERIC_EXPIRES = /[?&]expires=(\d{9,})(?:&|$)/i;
const AWS_AMZ_EXPIRES = /[?&]X-Amz-Expires=(\d+)/i;
const AWS_AMZ_DATE = /[?&]X-Amz-Date=(\d{8}T\d{6}Z)/i;
const TOS_ALGORITHM = /[?&]X-Tos-Algorithm=/i;
const TOS_EXPIRES = /[?&]X-Tos-Expires=(\d+)/i;
const TOS_DATE = /[?&]X-Tos-Date=(\d{8}T\d{6}Z)/i;

/** Hosts that typically serve short-lived hotlink / signed playback URLs. */
const EPHEMERAL_HOST_RE =
    /(^|\.)(dola\.com|douyinpic\.com|douyin\.com|bytedance\.com|volces\.com|volcengine\.com|byteimg\.com|ibyteimg\.com|snssdk\.com|tiktokcdn\.com|capcutapi\.com|capcut\.com)$/i;

function parseAwsStyleExpiryMs(url: string, expiresSeconds: number | null, dateMatch: RegExpMatchArray | null): number | null {
    if (expiresSeconds == null || !dateMatch) return null;
    const raw = dateMatch[1];
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6)) - 1;
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(9, 11));
    const minute = Number(raw.slice(11, 13));
    const second = Number(raw.slice(13, 15));
    const start = Date.UTC(year, month, day, hour, minute, second);
    if (!Number.isFinite(start)) return null;
    return start + expiresSeconds * 1000;
}

export function signedUrlExpiresAtMs(url: string): number | null {
    const cosOrQiniu = url.match(COS_SIGN_TIME) || url.match(QINIU_EXPIRES) || url.match(GENERIC_EXPIRES);
    if (cosOrQiniu) return Number(cosOrQiniu[1]) * 1000;

    const tosExpires = url.match(TOS_EXPIRES);
    const tosDate = url.match(TOS_DATE);
    if (tosExpires) {
        const fromDate = parseAwsStyleExpiryMs(url, Number(tosExpires[1]), tosDate);
        if (fromDate != null) return fromDate;
        // X-Tos-Expires alone is relative to now for some gateways — treat as already short-lived.
        return Date.now() + Number(tosExpires[1]) * 1000;
    }

    const amzExpires = url.match(AWS_AMZ_EXPIRES);
    const amzDate = url.match(AWS_AMZ_DATE);
    if (amzExpires) {
        const fromDate = parseAwsStyleExpiryMs(url, Number(amzExpires[1]), amzDate);
        if (fromDate != null) return fromDate;
    }

    return null;
}

/** True when the URL carries an explicit signature expiry that has passed (or is about to). */
export function isSignedUrlExpired(url?: string | null, skewMs = 60_000): boolean {
    if (!url || !/^https?:/i.test(url)) return false;
    const expiresAt = signedUrlExpiresAtMs(url);
    return expiresAt !== null && Date.now() + skewMs >= expiresAt;
}

/**
 * Upstream provider playback URLs (Dola/TOS/Douyin/etc.) that must not be the
 * long-term source of truth — they expire or hotlink-block even without query TTL.
 */
export function isEphemeralUpstreamMediaUrl(url?: string | null): boolean {
    if (!url || !/^https?:/i.test(url)) return false;
    try {
        const parsed = new URL(url);
        if (EPHEMERAL_HOST_RE.test(parsed.hostname)) return true;
        if (TOS_ALGORITHM.test(url) || /\/tos[-/]/i.test(parsed.pathname)) return true;
        return false;
    } catch {
        return false;
    }
}

/** Prefer local blob / remirrored CDN over this URL for long-term playback. */
export function isUnstableMediaUrl(url?: string | null): boolean {
    return isSignedUrlExpired(url) || isEphemeralUpstreamMediaUrl(url);
}
