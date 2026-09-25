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
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Input, Typography } from 'antd'
import { CheckIcon, CopyIcon, Mail } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useCountdown } from '@/hooks/use-countdown'
import { api } from '@/lib/api'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

import { AuthLayout } from '../auth-layout'
import {
  authFieldClassName,
  authSubmitClassName,
} from '../lib/auth-form-styles'

export type ResetPasswordSearchParams = {
  email?: string
  token?: string
}

type ResetPasswordConfirmProps = ResetPasswordSearchParams

export function ResetPasswordConfirm({
  email,
  token,
}: ResetPasswordConfirmProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: 30 })

  const isValidResetLink = Boolean(email && token)

  async function handleSubmit() {
    if (!isValidResetLink || !email || !token) {
      toast.error(t('Invalid reset link, please request a new password reset'))
      return
    }

    startCountdown()
    setLoading(true)
    try {
      const res = await api.post('/api/user/reset', { email, token }, {
        skipBusinessError: true,
      } as Record<string, unknown>)

      if (res?.data?.success) {
        const password = res.data.data
        setNewPassword(password)
        const copySuccess = await copyToClipboard(password)
        if (copySuccess) {
          toast.success(
            t('Password reset and copied to clipboard: {{password}}', {
              password,
            })
          )
        } else {
          toast.success(t('Password reset: {{password}}', { password }))
        }
      }
    } catch {
      // Errors handled by global interceptor
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!newPassword) return

    const copySuccess = await copyToClipboard(newPassword)
    if (copySuccess) {
      setCopied(true)
      toast.success(
        t('Password copied to clipboard: {{password}}', {
          password: newPassword,
        })
      )
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <AuthLayout>
      <div className='w-full space-y-6'>
        <div className='space-y-2 text-center'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('Reset password')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {newPassword
              ? t('auth.resetPasswordConfirm.success')
              : t('auth.resetPasswordConfirm.description')}
          </p>
        </div>

        <div className='space-y-4'>
          {!isValidResetLink && (
            <Alert
              type='error'
              showIcon
              title={t(
                'Invalid reset link, please request a new password reset.'
              )}
            />
          )}

          <div className='space-y-1.5'>
            <Typography.Text className='text-muted-foreground text-sm font-normal'>
              {t('Email')}
            </Typography.Text>
            <Input
              id='email'
              size='large'
              variant='filled'
              type='email'
              value={email || ''}
              disabled
              placeholder={t('Waiting for email...')}
              prefix={
                <Mail
                  className='text-muted-foreground size-4'
                  strokeWidth={1.75}
                  aria-hidden
                />
              }
              className={authFieldClassName}
            />
          </div>

          {newPassword && (
            <div className='space-y-1.5'>
              <Typography.Text className='text-muted-foreground text-sm font-normal'>
                {t('New password')}
              </Typography.Text>
              <div className='flex gap-2'>
                <Input
                  id='password'
                  size='large'
                  variant='filled'
                  value={newPassword}
                  disabled
                  className={cn(authFieldClassName, 'font-mono')}
                />
                <Button
                  type='default'
                  htmlType='button'
                  className='!h-11 !rounded-xl'
                  icon={
                    copied ? (
                      <CheckIcon className='h-4 w-4' />
                    ) : (
                      <CopyIcon className='h-4 w-4' />
                    )
                  }
                  onClick={handleCopy}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('Password has been copied to clipboard')}
              </p>
            </div>
          )}

          <Button
            type='primary'
            block
            onClick={
              newPassword
                ? () => navigate('/sign-in', { replace: true })
                : handleSubmit
            }
            disabled={
              newPassword ? false : loading || isActive || !isValidResetLink
            }
            loading={loading && !newPassword}
            className={authSubmitClassName}
          >
            {newPassword
              ? t('auth.resetPasswordConfirm.backToLogin')
              : isActive
                ? t('auth.resetPasswordConfirm.retry', {
                    seconds: secondsLeft,
                  })
                : t('auth.resetPasswordConfirm.confirm')}
          </Button>

          {!newPassword && (
            <Button
              type='link'
              block
              onClick={() => navigate('/sign-in', { replace: true })}
            >
              {t('Back to login')}
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  )
}
