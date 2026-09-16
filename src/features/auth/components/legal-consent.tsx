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
import { Checkbox, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { SystemStatus } from '../types'

interface LegalConsentProps {
  status: SystemStatus | null
  checked: boolean
  onCheckedChange: (nextValue: boolean) => void
  className?: string
}

export function LegalConsent({
  status,
  checked,
  onCheckedChange,
  className,
}: LegalConsentProps) {
  const { t } = useTranslation()
  const hasUserAgreement = Boolean(status?.user_agreement_enabled)
  const hasPrivacyPolicy = Boolean(status?.privacy_policy_enabled)

  if (!hasUserAgreement && !hasPrivacyPolicy) {
    return null
  }

  return (
    <div
      className={cn(
        'border-border/60 bg-muted/40 flex items-start gap-3 rounded-md border p-3',
        className
      )}
    >
      <Checkbox
        id='legal-consent'
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className='mt-0.5'
      />
      <Typography.Text
        type='secondary'
        className='!text-xs !leading-5'
        style={{ display: 'block' }}
      >
        <label htmlFor='legal-consent' className='cursor-pointer'>
          {t('I have read and agree to the')}{' '}
          {hasUserAgreement && (
            <a
              href='/user-agreement'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              {t('User Agreement')}
            </a>
          )}
          {hasUserAgreement && hasPrivacyPolicy && ' and the '}
          {hasPrivacyPolicy && (
            <a
              href='/privacy-policy'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary hover:underline'
            >
              {t('Privacy Policy')}
            </a>
          )}
          .
        </label>
      </Typography.Text>
    </div>
  )
}
