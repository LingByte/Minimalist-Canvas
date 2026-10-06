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
import { Button, Empty } from 'antd'
import { AlertTriangle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { FadeIn } from '@/components/page-transition'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  onRetry?: () => void
  action?: ReactNode
  className?: string
}

export function ErrorState(props: ErrorStateProps) {
  const { t } = useTranslation()
  const Icon = props.icon ?? AlertTriangle

  return (
    <FadeIn>
      <Empty
        className={cn('min-h-[300px] justify-center', props.className)}
        image={
          <div className='bg-muted mx-auto flex size-12 items-center justify-center rounded-full'>
            <Icon className='text-destructive size-6' />
          </div>
        }
        description={
          <div className='space-y-1'>
            <div className='text-foreground text-base font-medium'>
              {props.title ?? t('Oops! Something went wrong')}
            </div>
            {props.description != null && (
              <div className='text-muted-foreground text-sm'>
                {props.description}
              </div>
            )}
          </div>
        }
      >
        <div className='flex flex-wrap items-center justify-center gap-2'>
          {props.onRetry != null && (
            <Button size='small' onClick={props.onRetry}>
              {t('Retry')}
            </Button>
          )}
          {props.action}
        </div>
      </Empty>
    </FadeIn>
  )
}
