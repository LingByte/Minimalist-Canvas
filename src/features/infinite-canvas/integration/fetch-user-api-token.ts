import { fetchTokenKey, getApiKeys } from '@/features/keys/api'

/** Returns the user's first enabled relay API key (sk-...) for /v1 gateway calls. */
export async function fetchUserApiToken(): Promise<string | null> {
  try {
    const res = await getApiKeys({ p: 1, size: 20 })
    const items = res.data?.items
    if (!res.success || !items?.length) return null

    for (const token of items) {
      if (token.status !== 1) continue
      if (!token.unlimited_quota && token.remain_quota <= 0) continue

      const keyRes = await fetchTokenKey(token.id)
      const rawKey = keyRes.data?.key?.trim()
      if (keyRes.success && rawKey) {
        return rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`
      }
    }

    return null
  } catch {
    return null
  }
}
