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
import type { Row, Table } from '@tanstack/react-table'
import { Empty, Skeleton } from 'antd'
import { Database } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { tableHasCompactMeta } from './card-cell-utils'
import { CardRowContent } from './card-row-content'

interface MobileCardListProps<TData> {
  table: Table<TData>
  isLoading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  getRowKey?: (row: Row<TData>) => string | number
  getRowClassName?: (row: Row<TData>) => string | undefined
}

function ListSkeleton() {
  return (
    <div className='divide-y overflow-hidden rounded-lg border'>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className='px-3 py-2.5'>
          <div className='flex items-center justify-between'>
            <Skeleton.Input active size='small' style={{ width: 128, height: 16 }} />
            <Skeleton.Input active size='small' style={{ width: 64, height: 20 }} />
          </div>
          <div className='mt-1.5 grid grid-cols-2 gap-2'>
            <div className='flex-1'>
              <Skeleton.Input
                active
                size='small'
                style={{ width: 32, minWidth: 32, height: 8, marginBottom: 4 }}
              />
              <Skeleton.Input active size='small' block style={{ height: 16 }} />
            </div>
            <div className='flex-1'>
              <Skeleton.Input
                active
                size='small'
                style={{ width: 32, minWidth: 32, height: 8, marginBottom: 4 }}
              />
              <Skeleton.Input active size='small' block style={{ height: 16 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FallbackListSkeleton() {
  return (
    <div className='divide-y overflow-hidden rounded-lg border'>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className='space-y-1.5 px-3 py-2.5'>
          {[1, 2, 3].map((j) => (
            <div key={j} className='flex items-center justify-between'>
              <Skeleton.Input
                active
                size='small'
                style={{ width: 64, height: 10 }}
              />
              <Skeleton.Input
                active
                size='small'
                style={{ width: 112, height: 14 }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Mobile-optimized list view for table data.
 *
 * Renders rows inside a single bordered container with dividers —
 * a Vercel/Stripe-style list rather than individual cards.
 *
 * Per-row content is shared with the desktop card view via
 * {@link CardRowContent}; see `card-row-content.tsx` for the column-meta
 * extensions (`mobileTitle`, `mobileBadge`, `mobileHidden`).
 */
export function MobileCardList<TData>(props: MobileCardListProps<TData>) {
  const {
    table,
    isLoading = false,
    emptyTitle,
    emptyDescription,
    getRowKey,
    getRowClassName,
  } = props
  const { t } = useTranslation()

  const resolvedEmptyTitle = emptyTitle ?? t('No Data')
  const resolvedEmptyDescription = emptyDescription ?? t('No data available')

  const visibleColumns = table.getVisibleLeafColumns()
  const hasCompactMeta = React.useMemo(
    () => tableHasCompactMeta(table),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns]
  )

  if (isLoading) {
    return hasCompactMeta ? <ListSkeleton /> : <FallbackListSkeleton />
  }

  const rows = table.getRowModel().rows

  if (!rows || rows.length === 0) {
    return (
      <div className='rounded-lg border p-6'>
        <Empty
          className='border-none p-0'
          image={
            <div className='bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full'>
              <Database className='size-6' />
            </div>
          }
          description={
            <div className='space-y-1'>
              <div className='text-foreground text-base font-medium'>
                {resolvedEmptyTitle}
              </div>
              <div className='text-muted-foreground text-sm'>
                {resolvedEmptyDescription}
              </div>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className='divide-y overflow-hidden rounded-lg border'>
      {rows.map((row) => {
        const key = getRowKey ? getRowKey(row) : row.id
        return (
          <div
            key={key}
            className={cn(
              '[background-color:var(--data-table-card-bg,var(--table-row))] px-3 py-2.5',
              getRowClassName?.(row)
            )}
          >
            <CardRowContent row={row} compact={hasCompactMeta} />
          </div>
        )
      })}
    </div>
  )
}
