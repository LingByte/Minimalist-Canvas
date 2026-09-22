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
import { Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { Languages, Check } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import canvasI18n, { hostToCanvasLocale } from '@canvas/i18n'
import hostI18n from '@/i18n/config'
import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
} from '@/i18n/languages'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Always mutates the host (site-wide) i18n instance so canvas and the rest of
 * the app stay on the same language. Canvas listens via useHostLocaleSync.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const [hostLanguage, setHostLanguage] = useState(hostI18n.language)

  useEffect(() => {
    const onChange = (lng: string) => setHostLanguage(lng)
    hostI18n.on('languageChanged', onChange)
    return () => {
      hostI18n.off('languageChanged', onChange)
    }
  }, [])

  const currentLanguage = normalizeInterfaceLanguage(hostLanguage)
  const handleChangeLanguage = useCallback(
    async (code: string) => {
      await hostI18n.changeLanguage(code)
      const canvasLocale = hostToCanvasLocale(code)
      localStorage.setItem('minimalist-canvas:locale', canvasLocale)
      void canvasI18n.changeLanguage(canvasLocale)
      if (user) {
        try {
          await api.put('/api/user/self', { language: code })
        } catch {
          // Best-effort persistence; don't block the UI on failure
        }
      }
    },
    [user]
  )

  const items: MenuProps['items'] = useMemo(
    () =>
      INTERFACE_LANGUAGE_OPTIONS.map((lang) => ({
        key: lang.code,
        label: (
          <span className='flex w-full items-center gap-2'>
            {lang.label}
            <Check
              size={14}
              className={cn(
                'ms-auto',
                currentLanguage !== lang.code && 'hidden'
              )}
            />
          </span>
        ),
        onClick: () => {
          void handleChangeLanguage(lang.code)
        },
      })),
    [currentLanguage, handleChangeLanguage]
  )

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement='bottomRight'>
      <Button
        type='text'
        className='inline-flex h-9 w-9 items-center justify-center p-0'
        aria-label={t('Change language')}
        icon={<Languages className='size-[1.2rem]' />}
      />
    </Dropdown>
  )
}
