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
import type { Table } from '@tanstack/react-table'
import { Badge, Button, Drawer, Input, type InputProps } from 'antd'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableViewOptions } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { cn } from '@/lib/utils'

interface LogsFilterToolbarProps<TData> {
  table: Table<TData>
  primaryFilters: ReactNode
  advancedFilters?: ReactNode
  mobilePinnedFilters?: ReactNode
  mobileFilters?: ReactNode
  mobileFilterCount?: number
  stats?: ReactNode
  actionStart?: ReactNode
  hasActiveFilters: boolean
  hasAdvancedActiveFilters?: boolean
  advancedFilterCount?: number
  searchLoading?: boolean
  onReset: () => void
  onSearch: () => void
  className?: string
  /** Optional override for the primary filters grid layout */
  filtersGridClassName?: string
}

interface LogsFilterFieldProps {
  children: ReactNode
  wide?: boolean
  className?: string
}

export function LogsFilterField(props: LogsFilterFieldProps) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden [&_.ant-select]:w-full [&_.ant-select]:max-w-full',
        '[&_.ant-select-selector]:text-sm [&_.ant-select-selector]:!max-w-full',
        '[&_.ant-select-sm_.ant-select-selector]:!min-h-7 [&_.ant-select-sm_.ant-select-selector]:!h-7',
        props.wide && 'sm:col-span-2',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}

export function LogsFilterInput(props: InputProps) {
  return (
    <Input
      {...props}
      autoComplete='off'
      size='small'
      className={cn('min-w-0 text-sm leading-5', props.className)}
    />
  )
}

export function LogsFilterToolbar<TData>(props: LogsFilterToolbarProps<TData>) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  const hasAdvancedFilters = props.advancedFilters != null
  const activeAdvancedCount =
    props.advancedFilterCount ?? (props.hasAdvancedActiveFilters ? 1 : 0)
  const activeMobileFilterCount = props.mobileFilterCount ?? activeAdvancedCount

  const handleMobileReset = () => {
    props.onReset()
    setMobileFiltersOpen(false)
  }

  const handleMobileSearch = () => {
    props.onSearch()
    setMobileFiltersOpen(false)
  }

  const advancedToggle = hasAdvancedFilters ? (
    <Button
      type='text'
      size='small'
      onClick={() => setAdvancedOpen((open) => !open)}
      aria-expanded={advancedOpen}
      className={cn(
        'text-muted-foreground hover:text-foreground gap-1 px-2',
        props.hasAdvancedActiveFilters &&
          !advancedOpen &&
          'text-primary hover:text-primary'
      )}
    >
      {advancedOpen ? t('Collapse') : t('Expand')}
      {activeAdvancedCount > 0 && (
        <Badge
          count={activeAdvancedCount}
          size='small'
          className='ml-0.5'
        />
      )}
      <ChevronDown
        className={cn(
          'size-3.5 transition-transform duration-200',
          advancedOpen && 'rotate-180'
        )}
      />
    </Button>
  ) : null

  if (isMobile && props.mobilePinnedFilters != null) {
    return (
      <>
        <div
          className={cn('bg-card/50 rounded-lg border p-2.5', props.className)}
        >
          {!mobilePanelCollapsed && (
            <div className='grid gap-2'>{props.mobilePinnedFilters}</div>
          )}

          <div
            className={cn(
              'flex flex-col gap-2',
              !mobilePanelCollapsed && 'mt-2'
            )}
          >
            {!mobilePanelCollapsed && props.stats}
            <div className='flex items-center justify-end gap-1.5'>
              <Button
                type='text'
                size='small'
                onClick={() =>
                  setMobilePanelCollapsed((collapsed) => !collapsed)
                }
                aria-expanded={!mobilePanelCollapsed}
                aria-label={mobilePanelCollapsed ? t('Expand') : t('Collapse')}
                className='text-muted-foreground hover:text-foreground mr-auto'
                icon={
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-200',
                      !mobilePanelCollapsed && 'rotate-180'
                    )}
                  />
                }
              />
              {props.actionStart}
              <Button
                type='text'
                size='small'
                onClick={() => setMobileFiltersOpen(true)}
                className={cn(
                  'text-muted-foreground hover:text-foreground gap-1 px-2',
                  activeMobileFilterCount > 0 &&
                    'text-primary hover:text-primary'
                )}
              >
                {t('Filter')}
                {activeMobileFilterCount > 0 && (
                  <Badge
                    count={activeMobileFilterCount}
                    size='small'
                    className='ml-0.5'
                  />
                )}
              </Button>
              <Button
                type='primary'
                size='small'
                onClick={props.onSearch}
                disabled={props.searchLoading}
                icon={
                  props.searchLoading ? (
                    <Loader2 className='size-3.5 animate-spin' />
                  ) : undefined
                }
              >
                {t('Search')}
              </Button>
              <DataTableViewOptions table={props.table} />
            </div>
          </div>
        </div>

        <Drawer
          open={mobileFiltersOpen}
          onClose={() => setMobileFiltersOpen(false)}
          placement='bottom'
          height='85%'
          title={t('Filter')}
          styles={{ body: { paddingTop: 12 } }}
          footer={
            <div className='grid grid-cols-2 gap-2'>
              <Button
                type='default'
                onClick={handleMobileReset}
                disabled={!props.hasActiveFilters}
                block
              >
                {t('Reset')}
              </Button>
              <Button
                type='primary'
                onClick={handleMobileSearch}
                disabled={props.searchLoading}
                block
                icon={
                  props.searchLoading ? (
                    <Loader2 className='size-3.5 animate-spin' />
                  ) : undefined
                }
              >
                {t('Search')}
              </Button>
            </div>
          }
        >
          <p className='text-muted-foreground mb-3 text-sm'>
            {t('Adjust filters, then search to refresh the logs.')}
          </p>
          <div className='flex min-h-0 flex-1 flex-col gap-2'>
            {props.mobileFilters ?? (
              <>
                {props.primaryFilters}
                {props.advancedFilters}
              </>
            )}
          </div>
        </Drawer>
      </>
    )
  }

  return (
    <div
      className={cn(
        'bg-card/50 rounded-lg border p-2.5 sm:p-3',
        props.className
      )}
    >
      <div className='flex flex-wrap items-start gap-2'>
        <div
          className={cn(
            'grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]',
            props.filtersGridClassName
          )}
        >
          {props.primaryFilters}
        </div>
        {advancedToggle && (
          <div className='flex shrink-0 items-center justify-end'>
            {advancedToggle}
          </div>
        )}
      </div>

      {advancedOpen && props.advancedFilters && (
        <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]'>
          {props.advancedFilters}
        </div>
      )}

      <div className='mt-2 flex flex-wrap items-center gap-2'>
        {props.stats}
        <div className='ms-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2'>
          {props.actionStart}
          <Button
            type='default'
            size='small'
            onClick={props.onReset}
            disabled={!props.hasActiveFilters}
          >
            {t('Reset')}
          </Button>
          <Button
            type='primary'
            size='small'
            onClick={props.onSearch}
            disabled={props.searchLoading}
            icon={
              props.searchLoading ? (
                <Loader2 className='size-3.5 animate-spin' />
              ) : undefined
            }
          >
            {t('Search')}
          </Button>
          <DataTableViewOptions table={props.table} />
        </div>
      </div>
    </div>
  )
}
