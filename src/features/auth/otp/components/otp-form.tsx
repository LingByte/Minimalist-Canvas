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
import { Button, Input } from 'antd'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { login2fa } from '@/features/auth/api'
import {
  otpFormSchema,
  OTP_LENGTH,
  BACKUP_CODE_LENGTH,
} from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import {
  authFieldClassName,
  authSubmitClassName,
} from '@/features/auth/lib/auth-form-styles'
import {
  isValidOTP,
  isValidBackupCode,
  formatBackupCode,
  cleanBackupCode,
} from '@/features/auth/lib/validation'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

type OtpFormProps = React.HTMLAttributes<HTMLFormElement>

export function OtpForm({ className, ...props }: OtpFormProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [useBackupCode, setUseBackupCode] = useState(false)

  const pending2FAFlowToken = useAuthStore(
    (state) => state.auth.pending2FAFlowToken
  )
  const { handleLoginSuccess, redirectToLogin } = useAuthRedirect()

  const form = useForm<z.infer<typeof otpFormSchema>>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { otp: '' },
  })

  const otp = form.watch('otp')

  async function onSubmit(data: z.infer<typeof otpFormSchema>) {
    // Validate based on mode
    if (useBackupCode) {
      if (!isValidBackupCode(data.otp)) {
        toast.error(t('Backup code must be in format XXXX-XXXX'))
        return
      }
    } else {
      if (!isValidOTP(data.otp)) {
        toast.error(t('Verification code must be 6 digits'))
        return
      }
    }

    setIsLoading(true)
    try {
      // Remove all hyphens from backup code before sending to backend
      const code = useBackupCode ? cleanBackupCode(data.otp) : data.otp
      if (!pending2FAFlowToken) {
        toast.error(t('Login flow expired. Please sign in again.'))
        redirectToLogin()
        return
      }
      const res = await login2fa({
        code,
        flow_token: pending2FAFlowToken,
      })

      if (!res.success) {
        if (getServerErrorMessageKey(res)) return
        toast.error(res.message || t('Invalid code'))
        return
      }

      if (!res.data) {
        throw new Error(t('Login failed'))
      }

      await handleLoginSuccess(res.data)
      toast.success(t('Signed in'))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('2FA verification error:', error)
      if (getServerErrorMessageKey(error)) return
      const errorMessage =
        error instanceof Error ? error.message : t('Verification failed')
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  function handleToggleMode() {
    setUseBackupCode(!useBackupCode)
    form.setValue('otp', '')
  }

  function handleBackToLogin() {
    redirectToLogin()
  }

  const isFormValid = useBackupCode
    ? otp.length >= BACKUP_CODE_LENGTH
    : otp.length >= OTP_LENGTH

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='otp'
          render={({ field }) => (
            <FormItem className='gap-1.5'>
              <FormLabel className='text-muted-foreground text-sm font-normal'>
                {useBackupCode ? t('Backup Code') : t('Verification Code')}
              </FormLabel>
              <FormControl>
                {useBackupCode ? (
                  <Input
                    size='large'
                    variant='filled'
                    placeholder={t('Enter backup code (e.g., CAWD-OQDV)')}
                    {...field}
                    maxLength={BACKUP_CODE_LENGTH}
                    autoComplete='off'
                    className={cn(authFieldClassName, 'font-mono uppercase')}
                    onChange={(e) => {
                      const formatted = formatBackupCode(e.target.value)
                      field.onChange(formatted)
                    }}
                  />
                ) : (
                  <Input.OTP
                    length={OTP_LENGTH}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    size='large'
                  />
                )}
              </FormControl>
              <FormDescription className='text-muted-foreground text-xs'>
                {useBackupCode
                  ? t('Each backup code can only be used once.')
                  : t('Verification code updates every 30 seconds.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type='primary'
          htmlType='submit'
          block
          disabled={!isFormValid || isLoading}
          loading={isLoading}
          className={authSubmitClassName}
        >
          {t('Verify and Sign In')}
        </Button>

        <div className='flex items-center justify-center gap-2 text-sm'>
          <Button
            type='link'
            htmlType='button'
            size='small'
            className='!h-auto !p-0'
            onClick={handleToggleMode}
          >
            {useBackupCode ? t('Use authenticator code') : t('Use backup code')}
          </Button>
          <span className='text-muted-foreground'>·</span>
          <Button
            type='link'
            htmlType='button'
            size='small'
            className='!h-auto !p-0'
            onClick={handleBackToLogin}
          >
            {t('Back to login')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
