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
import { Button, Input, Modal, Tabs, Typography } from 'antd'
import { ShieldCheck, KeyRound } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  SecureVerificationState,
  VerificationMethod,
  VerificationMethods,
} from '../types'

interface SecureVerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  methods: VerificationMethods
  state: SecureVerificationState
  onVerify: (method: VerificationMethod, code?: string) => void | Promise<void>
  onCancel: () => void
  onCodeChange: (code: string) => void
  onMethodChange: (method: VerificationMethod) => void
}

export function SecureVerificationDialog({
  open,
  onOpenChange,
  methods,
  state,
  onVerify,
  onCancel,
  onCodeChange,
  onMethodChange,
}: SecureVerificationDialogProps) {
  const { t } = useTranslation()
  const availableTabs: VerificationMethod[] = useMemo(() => {
    const tabs: VerificationMethod[] = []
    if (methods.has2FA) tabs.push('2fa')
    if (methods.hasPasskey && methods.passkeySupported) tabs.push('passkey')
    return tabs
  }, [methods])

  const activeMethod =
    state.method ?? (availableTabs.length > 0 ? availableTabs[0] : null)

  const title =
    state.title ??
    (availableTabs.length
      ? 'Additional verification required'
      : 'Verification unavailable')

  const description =
    state.description ??
    (availableTabs.length
      ? 'Confirm your identity before accessing this sensitive action.'
      : 'Enable Two-factor Authentication or Passkey in your profile settings to continue.')

  const handleVerify = () => {
    if (!activeMethod) return
    const payload = activeMethod === '2fa' ? state.code : undefined
    onVerify(activeMethod, payload)
  }

  const verifyDisabled =
    state.loading ||
    (activeMethod === '2fa' && (!state.code.trim() || state.code.length < 6))

  const tabItems = [
    methods.has2FA
      ? {
          key: '2fa',
          label: t('Authenticator code'),
          children: (
            <div className='space-y-3'>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Enter the 6-digit Time-based One-Time Password or 8-character backup code from your authenticator app.'
                )}
              </p>
              <Input
                inputMode='numeric'
                maxLength={8}
                value={state.code}
                onChange={(event) => onCodeChange(event.target.value)}
                placeholder={t('Enter verification code')}
                disabled={state.loading}
                autoFocus={activeMethod === '2fa'}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !verifyDisabled) {
                    event.preventDefault()
                    handleVerify()
                  }
                }}
              />
            </div>
          ),
        }
      : null,
    methods.hasPasskey && methods.passkeySupported
      ? {
          key: 'passkey',
          label: t('Passkey'),
          children: (
            <div className='space-y-4'>
              <div className='bg-muted/50 flex items-center justify-center rounded-lg p-4'>
                <div className='text-muted-foreground flex items-center gap-3'>
                  <KeyRound className='text-primary h-6 w-6' />
                  <div className='text-left text-sm'>
                    <p className='text-foreground font-medium'>
                      {t('Use your Passkey')}
                    </p>
                    <p>
                      {t(
                        'We will prompt your device to confirm using biometrics or your hardware key.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
              {!methods.passkeySupported && (
                <p className='text-destructive text-sm'>
                  {t('This device does not support Passkey verification.')}
                </p>
              )}
            </div>
          ),
        }
      : null,
  ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[]

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (!state.loading) onOpenChange(false)
      }}
      title={
        <span className='flex items-center gap-2'>
          <ShieldCheck className='text-primary h-5 w-5' />
          {title}
        </span>
      }
      closable={!state.loading}
      maskClosable={!state.loading}
      destroyOnHidden
      width={448}
      footer={
        <div className='flex justify-end gap-2'>
          <Button type='default' disabled={state.loading} onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button
            type='primary'
            onClick={handleVerify}
            disabled={availableTabs.length === 0 || verifyDisabled}
            loading={state.loading}
          >
            {t('Verify')}
          </Button>
        </div>
      }
    >
      <Typography.Paragraph type='secondary' className='!mb-4'>
        {description}
      </Typography.Paragraph>

      {availableTabs.length === 0 ? (
        <div className='grid place-items-center gap-4 text-center'>
          <div className='bg-muted flex h-16 w-16 items-center justify-center rounded-2xl'>
            <ShieldCheck className='text-muted-foreground h-8 w-8' />
          </div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Enable Two-factor Authentication or Passkey in your profile to unlock sensitive operations.'
            )}
          </p>
        </div>
      ) : (
        <Tabs
          activeKey={activeMethod ?? availableTabs[0]}
          onChange={(value) => onMethodChange(value as VerificationMethod)}
          items={tabItems}
        />
      )}
    </Modal>
  )
}
