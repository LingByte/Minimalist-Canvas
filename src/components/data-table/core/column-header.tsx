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
import type { Column } from '@tanstack/react-table'
import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  ChevronsUpDown as CaretSortIcon,
  EyeOff as EyeNoneIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type DataTableColumnHeaderProps<TData, TValue> =
  React.HTMLAttributes<HTMLDivElement> & {
    column: Column<TData, TValue>
    title: React.ReactNode
  }

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  const { t } = useTranslation()
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  const items: MenuProps['items'] = [
    {
      key: 'asc',
      label: (
        <span className='inline-flex items-center gap-2'>
          <ArrowUpIcon className='text-muted-foreground/70 size-3.5' />
          {t('Asc')}
        </span>
      ),
      onClick: () => column.toggleSorting(false),
    },
    {
      key: 'desc',
      label: (
        <span className='inline-flex items-center gap-2'>
          <ArrowDownIcon className='text-muted-foreground/70 size-3.5' />
          {t('Desc')}
        </span>
      ),
      onClick: () => column.toggleSorting(true),
    },
    ...(column.getCanHide()
      ? [
          { type: 'divider' as const },
          {
            key: 'hide',
            label: (
              <span className='inline-flex items-center gap-2'>
                <EyeNoneIcon className='text-muted-foreground/70 size-3.5' />
                {t('Hide')}
              </span>
            ),
            onClick: () => column.toggleVisibility(false),
          },
        ]
      : []),
  ]

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <Dropdown menu={{ items }} trigger={['click']}>
        <Button
          type='text'
          size='small'
          className='-ms-3 inline-flex h-8 items-center gap-1'
        >
          <span>{title}</span>
          {(() => {
            const sorted = column.getIsSorted()
            if (sorted === 'desc') {
              return <ArrowDownIcon className='h-4 w-4' />
            }
            if (sorted === 'asc') {
              return <ArrowUpIcon className='h-4 w-4' />
            }
            return <CaretSortIcon className='h-4 w-4' />
          })()}
        </Button>
      </Dropdown>
    </div>
  )
}
