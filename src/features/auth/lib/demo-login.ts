/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { login } from '@/features/auth/api'
import { applyAuthBundle, isAuthBundle } from '@/lib/api'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

function envFlagEnabled(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  )
}

/** Build-time demo shortcut: one-click console entry with baked-in credentials. */
export function isDemoLoginEnabled(): boolean {
  return envFlagEnabled(import.meta.env.VITE_DEMO_LOGIN_ENABLED)
}

export function getDemoLoginCredentials() {
  return {
    username: import.meta.env.VITE_DEMO_LOGIN_USERNAME?.trim() || 'admin',
    password: import.meta.env.VITE_DEMO_LOGIN_PASSWORD?.trim() || 'admin123',
  }
}

/**
 * Password-login as the configured demo account.
 * Does not apply the session — callers should use handleLoginSuccess / applyAuthBundle.
 */
export async function loginWithDemoCredentials(): Promise<AuthBundle> {
  const { username, password } = getDemoLoginCredentials()
  const res = await login({ username, password })

  if (!res.success) {
    throw new Error(
      typeof res.message === 'string' && res.message
        ? res.message
        : 'Login failed'
    )
  }

  if (res.data && 'require_2fa' in res.data && res.data.require_2fa) {
    throw new Error('Demo login does not support two-factor authentication')
  }

  if (!isAuthBundle(res.data)) {
    throw new Error('Login failed')
  }

  return res.data
}

/**
 * Ensure the current app has a demo session applied.
 * Returns true when already authenticated or demo login succeeded.
 */
export async function ensureDemoSession(): Promise<boolean> {
  if (!isDemoLoginEnabled()) return false

  const { auth } = useAuthStore.getState()
  if (auth.user && auth.accessToken) return true

  const bundle = await loginWithDemoCredentials()
  applyAuthBundle(bundle)
  return true
}
