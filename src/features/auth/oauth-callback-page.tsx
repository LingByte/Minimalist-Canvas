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
import type { AxiosRequestConfig } from 'axios'
import i18next from 'i18next'
import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { OAuthCallbackScreen } from '@/features/auth/components/oauth-callback-screen'
import {
  OAUTH_BIND_CALLBACK_MESSAGE,
  OAUTH_BIND_RESULT_MESSAGE,
} from '@/features/auth/constants'
import { sanitizeAuthRedirect } from '@/features/auth/lib/auth-redirect'
import {
  parseTelegramBindCallback,
  postTelegramBindResult,
  startOAuthBindResponseDeadline,
} from '@/features/auth/lib/oauth-bind-window'
import {
  getOAuthSessionStorage,
  resolveOAuthCallbackMode,
} from '@/features/auth/lib/oauth-callback-mode'
import { api, applyAuthBundle, isAuthBundle } from '@/lib/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'

type OAuthRequestConfig = AxiosRequestConfig & {
  skipBusinessError?: boolean
}

interface OAuthBindingResult {
  type: typeof OAUTH_BIND_RESULT_MESSAGE
  provider: string
  state: string
  success: boolean
  message?: string
}

export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { provider = '' } = useParams<{ provider: string }>()
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code') ?? ''
  const callbackState = searchParams.get('state') ?? ''
  const error = searchParams.get('error') ?? undefined
  const errorDescription = searchParams.get('error_description') ?? undefined
  const redirect = searchParams.get('redirect') ?? undefined
  const telegramBind = searchParams.get('telegram_bind') ?? undefined
  const flowToken = searchParams.get('flow_token') ?? undefined
  const errorCode = searchParams.get('error_code') ?? undefined

  const isTelegramBindCallback =
    provider === 'telegram' &&
    (telegramBind === 'success' || telegramBind === 'error')
  let mode: 'login' | 'bind' = 'login'
  if (isTelegramBindCallback) {
    mode = 'bind'
  } else if (typeof window !== 'undefined') {
    mode = resolveOAuthCallbackMode(provider, callbackState, {
      opener: window.opener,
      storage: getOAuthSessionStorage(window),
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const telegramCallback =
      provider === 'telegram'
        ? parseTelegramBindCallback({
            telegram_bind: telegramBind,
            flow_token: flowToken,
            error_code: errorCode,
          })
        : null
    if (telegramCallback) {
      const opener = window.opener
      if (
        !postTelegramBindResult(
          telegramCallback,
          opener,
          window.location.origin
        )
      ) {
        toast.error(i18next.t('Telegram binding failed. Please try again.'))
        const closeTimeout = window.setTimeout(() => window.close(), 1500)
        return () => window.clearTimeout(closeTimeout)
      }
      window.close()
      return
    }

    if (mode === 'bind') {
      const opener = window.opener
      if (!opener || opener.closed) {
        toast.error(i18next.t('OAuth binding window is no longer available'))
        return
      }

      let cancelResultTimeout: () => void = () => undefined
      let delayedClose: number | undefined
      const handleBindingResult = (event: MessageEvent<unknown>) => {
        if (
          event.origin !== window.location.origin ||
          event.source !== opener
        ) {
          return
        }
        const result = event.data as Partial<OAuthBindingResult> | null
        if (
          !result ||
          result.type !== OAUTH_BIND_RESULT_MESSAGE ||
          result.provider !== provider ||
          result.state !== callbackState
        ) {
          return
        }
        cancelResultTimeout()
        if (result.success) {
          toast.success(i18next.t('Binding successful!'))
          window.close()
          return
        }
        toast.error(result.message || i18next.t('OAuth failed'))
        delayedClose = window.setTimeout(() => window.close(), 1500)
      }

      window.addEventListener('message', handleBindingResult)
      cancelResultTimeout = startOAuthBindResponseDeadline(() => {
        toast.error(i18next.t('OAuth binding timed out. Please try again.'))
        delayedClose = window.setTimeout(() => window.close(), 1500)
      })
      opener.postMessage(
        {
          type: OAUTH_BIND_CALLBACK_MESSAGE,
          provider,
          code,
          state: callbackState,
          error,
          errorDescription,
        },
        window.location.origin
      )
      return () => {
        window.removeEventListener('message', handleBindingResult)
        cancelResultTimeout()
        if (delayedClose !== undefined) window.clearTimeout(delayedClose)
      }
    }

    const safeNavigate = (target: unknown, fallback = '/dashboard') => {
      const href =
        sanitizeAuthRedirect(target, window.location.origin) ?? fallback
      void navigate(href, { replace: true })
    }

    if (!code && !error) {
      toast.error(i18next.t('Missing code'))
      safeNavigate('/sign-in', '/sign-in')
      return
    }

    void (async () => {
      try {
        const config: OAuthRequestConfig = {
          params: {
            code: code || undefined,
            state: callbackState,
            error,
            error_description: errorDescription,
          },
          skipBusinessError: true,
        }
        const response = await api.get(`/api/oauth/${provider}`, config)
        if (response.data?.success && isAuthBundle(response.data?.data)) {
          applyAuthBundle(response.data.data)
          safeNavigate(redirect)
          toast.success(i18next.t('Signed in successfully!'))
          return
        }
        const messageKey = getServerErrorMessageKey(response.data)
        toast.error(
          messageKey
            ? i18next.t(messageKey)
            : response.data?.message || i18next.t('OAuth failed')
        )
      } catch (err: unknown) {
        const messageKey = getServerErrorMessageKey(err)
        const responseMessage = (
          err as { response?: { data?: { message?: string } } }
        ).response?.data?.message
        if (!messageKey) {
          toast.error(
            responseMessage ||
              (err instanceof Error ? err.message : i18next.t('OAuth failed'))
          )
        }
      }
      safeNavigate('/sign-in', '/sign-in')
    })()
  }, [
    callbackState,
    code,
    error,
    errorCode,
    errorDescription,
    flowToken,
    mode,
    navigate,
    provider,
    redirect,
    telegramBind,
  ])

  return <OAuthCallbackScreen provider={provider} mode={mode} />
}
