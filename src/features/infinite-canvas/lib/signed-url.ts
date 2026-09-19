const COS_SIGN_TIME = /[?&]q-(?:sign|key)-time=\d+(?:%3B|;)(\d+)/i;
const QINIU_EXPIRES = /[?&]e=(\d{9,})(?:&|$)/i;
const GENERIC_EXPIRES = /[?&]expires=(\d{9,})(?:&|$)/i;

export function signedUrlExpiresAtMs(url: string): number | null {
    const match = url.match(COS_SIGN_TIME) || url.match(QINIU_EXPIRES) || url.match(GENERIC_EXPIRES);
    return match ? Number(match[1]) * 1000 : null;
}

export function isSignedUrlExpired(url?: string | null, skewMs = 60_000): boolean {
    if (!url || !/^https?:/i.test(url)) return false;
    const expiresAt = signedUrlExpiresAtMs(url);
    return expiresAt !== null && Date.now() + skewMs >= expiresAt;
}
