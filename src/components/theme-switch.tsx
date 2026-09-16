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
import { Check, Moon, Sun } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

export function ThemeSwitch() {
  const { t } = useTranslation()
  const { theme, resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const themeColor = resolvedTheme === 'dark' ? '#020817' : '#fff'
    const metaThemeColor = document.querySelector("meta[name='theme-color']")
    if (metaThemeColor) metaThemeColor.setAttribute('content', themeColor)
  }, [resolvedTheme])

  const items: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'light',
        label: (
          <span className='flex w-full items-center gap-2'>
            {t('Light')}
            <Check
              size={14}
              className={cn('ms-auto', theme !== 'light' && 'hidden')}
            />
          </span>
        ),
        onClick: () => setTheme('light'),
      },
      {
        key: 'dark',
        label: (
          <span className='flex w-full items-center gap-2'>
            {t('Dark')}
            <Check
              size={14}
              className={cn('ms-auto', theme !== 'dark' && 'hidden')}
            />
          </span>
        ),
        onClick: () => setTheme('dark'),
      },
      {
        key: 'system',
        label: (
          <span className='flex w-full items-center gap-2'>
            {t('System')}
            <Check
              size={14}
              className={cn('ms-auto', theme !== 'system' && 'hidden')}
            />
          </span>
        ),
        onClick: () => setTheme('system'),
      },
    ],
    [setTheme, t, theme]
  )

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement='bottomRight'>
      <Button
        type='text'
        className='relative inline-flex h-9 w-9 items-center justify-center p-0'
        aria-label={t('Toggle theme')}
        icon={
          resolvedTheme === 'dark' ? (
            <Moon className='size-[1.2rem]' />
          ) : (
            <Sun className='size-[1.2rem]' />
          )
        }
      />
    </Dropdown>
  )
}
