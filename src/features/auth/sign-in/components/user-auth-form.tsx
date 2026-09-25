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
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Button, Input, Modal, Typography } from 'antd'
import axios from 'axios'
import { Lock, LogIn, KeyRound, Mail } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { PasswordInput } from '@/components/password-input'
import { Turnstile } from '@/components/turnstile'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { login, wechatLoginByCode } from '@/features/auth/api'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import { OAuthProviders } from '@/features/auth/components/oauth-providers'
import { loginFormSchema } from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { useCaptchaGate } from '@/features/auth/hooks/use-captcha-gate'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { beginPasskeyLogin, finishPasskeyLogin } from '@/features/auth/passkey'
import type { AuthFormProps } from '@/features/auth/types'
import { useStatus } from '@/hooks/use-status'
import { applyAuthBundle, isAuthBundle } from '@/lib/api'
import { getSavedLanguage } from '@/features/auth/lib/auth-redirect'
import i18n from 'i18next'
import {
  buildAssertionResult,
  prepareCredentialRequestOptions,
  isPasskeySupported as detectPasskeySupport,
} from '@/lib/passkey'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { SmartImage } from '@/components/smart-image'
import {
  authFieldClassName,
  authSubmitClassName,
} from '@/features/auth/lib/auth-form-styles'

export function UserAuthForm({
  className,
  redirectTo,
  onAuthenticated,
  ...props
}: AuthFormProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [wechatCode, setWeChatCode] = useState('')
  const [agreedToLegal, setAgreedToLegal] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const [isWeChatDialogOpen, setIsWeChatDialogOpen] = useState(false)
  const [isWeChatSubmitting, setIsWeChatSubmitting] = useState(false)
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0)
  const legalConsentErrorMessage = t('Please agree to the legal terms first')
  const loginFailedMessage = t('Login failed')

  const { status } = useStatus()
  const passkeyLoginEnabled = Boolean(
    status?.passkey_login ?? status?.data?.passkey_login
  )
  const passwordLoginEnabled =
    (status?.password_login_enabled ??
      status?.data?.password_login_enabled ??
      true) !== false
  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()
  const { openGate, captchaModal, formSubmitting } = useCaptchaGate()
  const { handleLoginSuccess, redirectTo2FA } = useAuthRedirect()
  const setPending2FAFlowToken = useAuthStore(
    (state) => state.auth.setPending2FAFlowToken
  )

  const completeLogin = async (bundle: Parameters<typeof handleLoginSuccess>[0]) => {
    if (onAuthenticated) {
      applyAuthBundle(bundle)
      const savedLang = getSavedLanguage(bundle.user)
      if (savedLang && savedLang !== i18n.language) {
        await i18n.changeLanguage(savedLang)
      }
      onAuthenticated()
      return
    }
    await handleLoginSuccess(bundle, redirectTo)
  }

  const hasUserAgreement = Boolean(status?.user_agreement_enabled)
  const hasPrivacyPolicy = Boolean(status?.privacy_policy_enabled)
  const requiresLegalConsent = hasUserAgreement || hasPrivacyPolicy
  const passkeyButtonDisabled =
    isPasskeyLoading ||
    !passkeySupported ||
    (requiresLegalConsent && !agreedToLegal)
  const hasWeChatLogin = Boolean(status?.wechat_login)
  const hasOAuthLogin = Boolean(
    status?.github_oauth ||
    status?.discord_oauth ||
    status?.oidc_enabled ||
    status?.linuxdo_oauth ||
    status?.telegram_oauth ||
    (status?.custom_oauth_providers?.length ?? 0) > 0
  )
  const hasAlternativeLogin =
    passkeyLoginEnabled || hasWeChatLogin || hasOAuthLogin

  useEffect(() => {
    if (requiresLegalConsent) {
      setAgreedToLegal(false)
    } else {
      setAgreedToLegal(true)
    }
  }, [requiresLegalConsent])

  useEffect(() => {
    detectPasskeySupport()
      .then(setPasskeySupported)
      .catch(() => setPasskeySupported(false))
  }, [])

  const form = useForm<z.infer<typeof loginFormSchema>>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  })

  const wechatQrCodeUrl = useMemo(() => {
    return (
      status?.wechat_qrcode ||
      status?.wechat_qr_code ||
      status?.wechat_qrcode_image_url ||
      status?.wechat_qr_code_image_url ||
      status?.wechat_account_qrcode_image_url ||
      status?.WeChatAccountQRCodeImageURL ||
      status?.data?.wechat_qrcode ||
      status?.data?.WeChatAccountQRCodeImageURL ||
      ''
    )
  }, [status])

  const busy = isLoading || formSubmitting

  async function onSubmit(data: z.infer<typeof loginFormSchema>) {
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }

    if (!validateTurnstile()) return

    const submittedTurnstileToken = turnstileToken
    if (isTurnstileEnabled) {
      setTurnstileToken('')
      setTurnstileWidgetKey((current) => current + 1)
    }

    openGate(async (proof) => {
      setIsLoading(true)
      try {
        const res = await login({
          username: data.username,
          password: data.password,
          turnstile: submittedTurnstileToken,
          captcha: proof,
        })

        if (res.success) {
          if (res.data && 'require_2fa' in res.data && res.data.require_2fa) {
            if (!res.data.flow_token) {
              throw new Error(t('Login flow expired. Please sign in again.'))
            }
            setPending2FAFlowToken(res.data.flow_token)
            redirectTo2FA()
            return
          }

          if (!isAuthBundle(res.data)) {
            throw new Error(t('Login failed'))
          }
          await completeLogin(res.data)
          toast.success(t('Welcome back!'))
        }
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) return
        toast.error(error instanceof Error ? error.message : loginFailedMessage)
      } finally {
        setIsLoading(false)
      }
    }, { formSubmit: true })
  }

  const handleOpenWeChatDialog = () => {
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }

    setIsWeChatDialogOpen(true)
  }

  const handleWeChatDialogChange = (open: boolean) => {
    setIsWeChatDialogOpen(open)
    if (!open) {
      setWeChatCode('')
      setIsWeChatSubmitting(false)
    }
  }

  async function handleWeChatLogin() {
    if (!wechatCode.trim()) {
      toast.error(t('Please enter the verification code'))
      return
    }

    setIsWeChatSubmitting(true)
    try {
      const res = await wechatLoginByCode(wechatCode)
      if (res?.success && isAuthBundle(res.data)) {
        await completeLogin(res.data)
        toast.success(t('Signed in via WeChat'))
        handleWeChatDialogChange(false)
      } else {
        if (getServerErrorMessageKey(res)) return
        toast.error(res?.message || loginFailedMessage)
      }
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      toast.error(loginFailedMessage)
    } finally {
      setIsWeChatSubmitting(false)
    }
  }

  async function handlePasskeyLogin() {
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(legalConsentErrorMessage)
      return
    }

    if (!passkeySupported) {
      toast.error(t('Passkey is not supported on this device'))
      return
    }

    if (!navigator?.credentials) {
      toast.error(t('Passkey is not available in this browser'))
      return
    }

    setIsPasskeyLoading(true)
    try {
      const begin = await beginPasskeyLogin()
      if (!begin.success) {
        if (getServerErrorMessageKey(begin)) return
        throw new Error(begin.message || t('Failed to start Passkey login'))
      }

      const publicKey = prepareCredentialRequestOptions(
        begin.data?.options ?? begin.data
      )
      const flowToken = begin.data?.flow_token
      if (!flowToken) {
        throw new Error(t('Login flow expired. Please sign in again.'))
      }

      const credential = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential | null

      if (!credential) {
        toast.info(t('Passkey login was cancelled'))
        return
      }

      const assertion = buildAssertionResult(credential)
      if (!assertion) {
        throw new Error(t('Invalid Passkey response'))
      }

      const finish = await finishPasskeyLogin(flowToken, assertion)
      if (!finish.success) {
        if (getServerErrorMessageKey(finish)) return
        throw new Error(finish.message || t('Failed to complete Passkey login'))
      }

      if (!isAuthBundle(finish.data)) {
        throw new Error(t('Missing user data from Passkey login response'))
      }

      await completeLogin(finish.data)
      toast.success(t('Signed in with Passkey'))
    } catch (error: unknown) {
      if (getServerErrorMessageKey(error)) return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast.info(t('Passkey login was cancelled or timed out'))
      } else if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error(t('Passkey login failed'))
      }
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  const alternativeLoginMethods = (
    <>
      {passkeyLoginEnabled && (
        <div className='space-y-1'>
          <Button
            type='default'
            htmlType='button'
            disabled={passkeyButtonDisabled}
            onClick={handlePasskeyLogin}
            loading={isPasskeyLoading}
            icon={!isPasskeyLoading ? <KeyRound className='h-4 w-4' /> : undefined}
            block
            className='!h-11 !justify-center !gap-2 !rounded-xl'
          >
            {t('Sign in with Passkey')}
          </Button>
          {!passkeySupported && (
            <p className='text-muted-foreground text-xs'>
              {t('Passkey is not supported on this device.')}
            </p>
          )}
        </div>
      )}

      <OAuthProviders
        status={status}
        redirectTo={redirectTo}
        disabled={busy || (requiresLegalConsent && !agreedToLegal)}
        onWeChatLogin={hasWeChatLogin ? handleOpenWeChatDialog : undefined}
        isWeChatLoading={isWeChatSubmitting}
      />
    </>
  )

  const canRegister =
    !status?.self_use_mode_enabled && status?.register_enabled !== false

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        {passwordLoginEnabled && (
          <>
            <FormField
              control={form.control}
              name='username'
              render={({ field }) => (
                <FormItem className='gap-1.5'>
                  <FormLabel className='text-muted-foreground text-sm font-normal'>
                    {t('Username or Email')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      size='large'
                      variant='filled'
                      autoComplete='username'
                      placeholder={t('Enter your username or email')}
                      prefix={
                        <Mail
                          className='text-muted-foreground size-4'
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      }
                      className={authFieldClassName}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='password'
              render={({ field }) => (
                <FormItem className='gap-1.5'>
                  <FormLabel className='text-muted-foreground text-sm font-normal'>
                    {t('Password')}
                  </FormLabel>
                  <FormControl>
                    <PasswordInput
                      size='large'
                      variant='filled'
                      autoComplete='current-password'
                      placeholder={t('Enter password')}
                      prefix={
                        <Lock
                          className='text-muted-foreground size-4'
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      }
                      className={authFieldClassName}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground text-sm'>
                {canRegister ? (
                  <>
                    {t("Don't have an account?")}{' '}
                    <Link
                      to='/sign-up'
                      className='text-primary font-medium hover:underline'
                    >
                      {t('Sign up')}
                    </Link>
                  </>
                ) : null}
              </span>
              <Link
                to='/forgot-password'
                className='text-muted-foreground shrink-0 text-sm transition-colors hover:text-foreground'
              >
                {t('Forgot password?')}
              </Link>
            </div>

            <Button
              type='primary'
              htmlType='submit'
              block
              disabled={busy || (requiresLegalConsent && !agreedToLegal)}
              loading={busy}
              icon={!busy ? <LogIn className='size-4' /> : undefined}
              className={authSubmitClassName}
            >
              {t('Sign in')}
            </Button>

            {isTurnstileEnabled && (
              <div className='mt-1'>
                <Turnstile
                  key={turnstileWidgetKey}
                  siteKey={turnstileSiteKey}
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken('')}
                />
              </div>
            )}
          </>
        )}

        <LegalConsent
          status={status}
          checked={agreedToLegal}
          onCheckedChange={setAgreedToLegal}
          className='mt-0.5'
        />

        {hasAlternativeLogin ? alternativeLoginMethods : null}
      </form>

      {hasWeChatLogin && (
        <Modal
          open={isWeChatDialogOpen}
          onCancel={() => handleWeChatDialogChange(false)}
          title={t('WeChat sign in')}
          destroyOnHidden
          width={384}
          footer={
            <div className='flex justify-end gap-2'>
              <Button
                type='default'
                htmlType='button'
                onClick={() => handleWeChatDialogChange(false)}
                disabled={isWeChatSubmitting}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='primary'
                htmlType='button'
                onClick={handleWeChatLogin}
                disabled={
                  isWeChatSubmitting ||
                  !wechatCode.trim() ||
                  (requiresLegalConsent && !agreedToLegal)
                }
                loading={isWeChatSubmitting}
              >
                {t('Confirm')}
              </Button>
            </div>
          }
        >
          <p className='text-muted-foreground mb-4 text-sm'>
            {t(
              'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
            )}
          </p>
          {wechatQrCodeUrl ? (
            <div className='mb-4 flex justify-center'>
              <SmartImage
                src={wechatQrCodeUrl}
                alt={t('WeChat login QR code')}
                className='h-40 w-40 rounded-md border object-contain'
              />
            </div>
          ) : (
            <p className='text-muted-foreground mb-4 text-sm'>
              {t('QR code is not configured. Please contact support.')}
            </p>
          )}
          <div className='grid gap-2'>
            <Typography.Text>{t('Verification code')}</Typography.Text>
            <Input
              id='wechat-code'
              placeholder={t('Enter the verification code')}
              value={wechatCode}
              onChange={(event) => setWeChatCode(event.target.value)}
              autoComplete='one-time-code'
            />
          </div>
        </Modal>
      )}
      {captchaModal}
    </Form>
  )
}
