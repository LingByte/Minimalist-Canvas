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
import { Button, Select } from 'antd'
import type { Table } from '@tanstack/react-table'
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronsLeft as DoubleArrowLeftIcon,
  ChevronsRight as DoubleArrowRightIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn, getPageNumbers } from '@/lib/utils'

type DataTablePaginationProps<TData> = {
  table: Table<TData>
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100] as const

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const { t } = useTranslation()
  const pagination = table.getState().pagination
  const currentPage = pagination.pageIndex + 1
  const pageSize = pagination.pageSize
  const totalPages = table.getPageCount()
  const totalRows = table.getRowCount()
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div
      className={cn(
        '@container/pagination flex min-w-0 items-center justify-end overflow-clip'
      )}
      style={{ overflowClipMargin: 1 }}
    >
      <div className='flex min-w-0 shrink-0 items-center gap-2 @xl/pagination:gap-3'>
        <div className='flex shrink-0 items-baseline gap-1.5 text-xs font-medium whitespace-nowrap sm:text-sm'>
          <span className='text-muted-foreground/80'>{t('Total:')}</span>
          <span className='text-foreground tabular-nums'>
            {totalRows.toLocaleString()}
          </span>
        </div>

        <div className='flex shrink-0 items-center gap-1.5 @lg/pagination:gap-2'>
          <p className='text-muted-foreground/80 hidden text-sm font-medium whitespace-nowrap @2xl/pagination:block'>
            {t('Rows per page')}
          </p>
          <Select
            className='w-[64px] sm:w-[70px]'
            size='small'
            value={`${pageSize}`}
            onChange={(value) => {
              table.setPageSize(Number(value))
            }}
            options={PAGE_SIZE_OPTIONS.map((size) => ({
              value: `${size}`,
              label: size,
            }))}
            popupMatchSelectWidth={false}
            placement='topLeft'
          />
        </div>

        <div className='flex min-w-0 shrink-0 items-center gap-1 @lg/pagination:gap-1.5 @xl/pagination:gap-2'>
          <Button
            className='text-muted-foreground hover:text-foreground disabled:text-muted-foreground/50 hidden h-8 w-8 items-center justify-center p-0 @max-lg/pagination:hidden @lg/pagination:inline-flex'
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('Go to first page')}
            icon={<DoubleArrowLeftIcon className='h-4 w-4' />}
          />
          <Button
            className='text-muted-foreground hover:text-foreground disabled:text-muted-foreground/50 inline-flex h-8 w-8 items-center justify-center p-0'
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('Go to previous page')}
            icon={<ChevronLeftIcon className='h-4 w-4' />}
          />

          {pageNumbers.map((pageNumber, index) => (
            <div key={`${pageNumber}-${index}`} className='flex items-center'>
              {pageNumber === '...' ? (
                <span className='text-muted-foreground/60 px-0.5 text-sm @lg/pagination:px-1'>
                  ...
                </span>
              ) : (
                <Button
                  type={currentPage === pageNumber ? 'primary' : 'default'}
                  className={cn(
                    'h-8 min-w-8 px-2 tabular-nums',
                    currentPage === pageNumber
                      ? 'font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => table.setPageIndex((pageNumber as number) - 1)}
                  aria-label={t('Go to page {{page}}', { page: pageNumber })}
                >
                  {pageNumber}
                </Button>
              )}
            </div>
          ))}

          <Button
            className='text-muted-foreground hover:text-foreground disabled:text-muted-foreground/50 inline-flex h-8 w-8 items-center justify-center p-0'
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t('Go to next page')}
            icon={<ChevronRightIcon className='h-4 w-4' />}
          />
          <Button
            className='text-muted-foreground hover:text-foreground disabled:text-muted-foreground/50 hidden h-8 w-8 items-center justify-center p-0 @max-lg/pagination:hidden @lg/pagination:inline-flex'
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label={t('Go to last page')}
            icon={<DoubleArrowRightIcon className='h-4 w-4' />}
          />
        </div>
      </div>
    </div>
  )
}
