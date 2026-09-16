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
import { useTranslation } from 'react-i18next'
import { Skeleton } from 'antd'

import {
  DEFAULT_LOGO,
  DEFAULT_SYSTEM_NAME,
  DEFAULT_SYSTEM_TAGLINE,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

type BrandIdentitySize = 'sm' | 'md' | 'lg'

const SIZE_STYLES: Record<
  BrandIdentitySize,
  { logo: string; title: string; tagline: string; gap: string }
> = {
  sm: {
    logo: 'h-7 w-auto max-w-[2.75rem]',
    title: 'text-sm leading-none',
    tagline: 'text-[10px] leading-none tracking-[0.18em]',
    gap: 'gap-2',
  },
  md: {
    logo: 'h-9 w-auto max-w-[3.25rem]',
    title: 'text-base leading-none',
    tagline: 'text-[11px] leading-none tracking-[0.2em]',
    gap: 'gap-2.5',
  },
  lg: {
    logo: 'h-11 w-auto max-w-[4rem]',
    title: 'text-xl leading-none',
    tagline: 'text-xs leading-none tracking-[0.22em]',
    gap: 'gap-3',
  },
}

export interface BrandIdentityProps {
  logo?: string
  name?: string
  tagline?: string
  size?: BrandIdentitySize
  showTagline?: boolean
  loading?: boolean
  className?: string
}

export function BrandIdentity({
  logo = DEFAULT_LOGO,
  name = DEFAULT_SYSTEM_NAME,
  tagline = DEFAULT_SYSTEM_TAGLINE,
  size = 'md',
  showTagline = true,
  loading = false,
  className,
}: BrandIdentityProps) {
  const { t } = useTranslation()
  const styles = SIZE_STYLES[size]

  if (loading) {
    return (
      <div className={cn('flex items-center', styles.gap, className)}>
        <Skeleton.Avatar
          active
          shape='square'
          size='small'
          className={cn('shrink-0', styles.logo)}
        />
        <div className='space-y-1.5'>
          <Skeleton.Input active size='small' style={{ width: 96, height: 16 }} />
          {showTagline && (
            <Skeleton.Input active size='small' style={{ width: 112, height: 10 }} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 items-center', styles.gap, className)}>
      <img
        src={logo}
        alt={t('Logo')}
        className={cn('shrink-0 object-contain', styles.logo)}
      />
      <div className='min-w-0 text-left leading-tight'>
        <div
          className={cn(
            'truncate font-semibold text-[#1f4f86] dark:text-[#dbeafe]',
            styles.title
          )}
        >
          {name}
        </div>
        {showTagline && (
          <div
            className={cn(
              'mt-1 truncate font-medium text-[#5b86b8] uppercase dark:text-[#93c5fd]/80',
              styles.tagline
            )}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  )
}
