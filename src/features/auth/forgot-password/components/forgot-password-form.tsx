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
import { ArrowRight, Mail } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Turnstile } from '@/components/turnstile'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { sendPasswordResetEmail } from '@/features/auth/api'
import {
  forgotPasswordFormSchema,
  PASSWORD_RESET_COUNTDOWN,
} from '@/features/auth/constants'
import { useCaptchaGate } from '@/features/auth/hooks/use-captcha-gate'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import {
  authFieldClassName,
  authSubmitClassName,
} from '@/features/auth/lib/auth-form-styles'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)

  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()
  const { openGate, captchaModal, formSubmitting } = useCaptchaGate()
  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: PASSWORD_RESET_COUNTDOWN })

  const form = useForm<z.infer<typeof forgotPasswordFormSchema>>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  })
  const turnstileReady = !isTurnstileEnabled || Boolean(turnstileToken)
  const busy = isLoading || formSubmitting

  async function onSubmit(data: z.infer<typeof forgotPasswordFormSchema>) {
    if (!validateTurnstile()) return

    const submittedTurnstileToken = turnstileToken
    if (isTurnstileEnabled) {
      setTurnstileToken('')
    }

    openGate(async (proof) => {
      setIsLoading(true)
      try {
        const res = await sendPasswordResetEmail(
          data.email,
          submittedTurnstileToken,
          proof
        )
        if (res?.success) {
          form.reset()
          startCountdown()
          toast.success(t('Reset email sent, please check your inbox'))
        } else {
          toast.error(res?.message || t('Failed to send reset email'))
        }
      } catch {
        // Errors are handled by global interceptor
      } finally {
        setIsLoading(false)
      }
    }, { formSubmit: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem className='gap-1.5'>
              <FormLabel className='text-muted-foreground text-sm font-normal'>
                {t('Email')}
              </FormLabel>
              <FormControl>
                <Input
                  size='large'
                  variant='filled'
                  type='email'
                  autoComplete='email'
                  placeholder={t('name@example.com')}
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

        <Button
          type='primary'
          htmlType='submit'
          block
          disabled={busy || isActive || !turnstileReady}
          loading={busy}
          icon={!busy && !isActive ? <ArrowRight className='size-4' /> : undefined}
          iconPlacement='end'
          className={authSubmitClassName}
        >
          {isActive
            ? t('Resend ({{seconds}}s)', { seconds: secondsLeft })
            : t('Send reset email')}
        </Button>

        {isTurnstileEnabled && (
          <div className='mt-1'>
            <Turnstile
              siteKey={turnstileSiteKey}
              onVerify={setTurnstileToken}
            />
          </div>
        )}
      </form>
      {captchaModal}
    </Form>
  )
}
