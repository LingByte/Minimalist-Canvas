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
import { Filter, RotateCcw, Calendar, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal, Select } from 'antd'

import { DateTimePicker } from '@/components/datetime-picker'
import {
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from '@/features/dashboard/constants'
import {
  buildDefaultDashboardFilters,
  cleanFilters,
} from '@/features/dashboard/lib'
import type {
  DashboardChartPreferences,
  DashboardFilters,
} from '@/features/dashboard/types'
import { getRollingDateRange, type TimeGranularity } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

interface ModelsFilterProps {
  preferences: DashboardChartPreferences
  // The filters currently applied to the dashboard. The dialog edits a copy of
  // these so reopening it never discards a manually picked range.
  currentFilters: DashboardFilters
  onFilterChange: (filters: DashboardFilters) => void
  onReset: () => void
  titleKey?: string
  descriptionKey?: string
}

// Quick-range presets imply a sensible granularity (matching the app's
// range<->granularity pairing), so picking "7 Days" requests daily buckets
// instead of leaving the granularity on its previous value (e.g. hourly).
function granularityForRangeDays(days: number): TimeGranularity {
  if (days <= 1) return 'hour'
  if (days >= 29) return 'week'
  return 'day'
}

// Highlights the matching quick-range button when the applied range spans an
// exact preset; custom ranges leave every quick button unselected.
function detectQuickRangeDays(
  filters: DashboardFilters | undefined
): number | null {
  const start = filters?.start_timestamp
  const end = filters?.end_timestamp
  if (!start || !end) return null
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return TIME_RANGE_PRESETS.some((preset) => preset.days === days) ? days : null
}

/**
 * Section divider component for better visual organization
 */
const SectionDivider = ({ label }: { label: string }) => (
  <div className='relative'>
    <div className='absolute inset-0 flex items-center'>
      <span className='w-full border-t' />
    </div>
    <div className='relative flex justify-center text-xs uppercase'>
      <span className='bg-background text-muted-foreground px-2'>{label}</span>
    </div>
  </div>
)

export function ModelsFilter(props: ModelsFilterProps) {
  const { t } = useTranslation()
  // 使用已缓存的用户数据，避免重复调用 API
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = user?.role && user.role >= 10

  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>(
    () =>
      props.currentFilters ?? buildDefaultDashboardFilters(props.preferences)
  )
  const [selectedRange, setSelectedRange] = useState<number | null>(() =>
    detectQuickRangeDays(props.currentFilters)
  )

  const handleOpen = () => {
    // Sync the editing state from the applied filters every time the dialog
    // opens so a previously applied manual range is preserved.
    const applied =
      props.currentFilters ?? buildDefaultDashboardFilters(props.preferences)
    setFilters(applied)
    setSelectedRange(detectQuickRangeDays(applied))
    setOpen(true)
  }

  const handleApply = () => {
    props.onFilterChange(
      cleanFilters(
        filters as unknown as Record<string, unknown>
      ) as typeof filters
    )
    setOpen(false)
  }

  const handleReset = () => {
    const days = props.preferences.defaultTimeRangeDays
    const { start, end } = getRollingDateRange(days)
    setFilters({
      ...buildDefaultDashboardFilters(props.preferences),
      start_timestamp: start,
      end_timestamp: end,
    })
    setSelectedRange(days)
    props.onReset()
    setOpen(false)
  }

  const handleChange = (
    field: keyof DashboardFilters,
    value: Date | string | undefined
  ) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
    if (field === 'start_timestamp' || field === 'end_timestamp') {
      setSelectedRange(null)
    }
  }

  const handleQuickRange = (days: number) => {
    const { start, end } = getRollingDateRange(days)

    setFilters((prev) => ({
      ...prev,
      start_timestamp: start,
      end_timestamp: end,
      time_granularity: granularityForRangeDays(days),
    }))
    setSelectedRange(days)
  }

  return (
    <>
      <Button size='small' onClick={handleOpen}>
        <Filter className='mr-2 h-4 w-4' />
        {t('Filter')}
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={t(props.titleKey ?? 'Model Analytics Filters')}
        width={512}
        styles={{
          body: {
            maxHeight: 'min(48vh, 460px)',
            overflowY: 'auto',
            paddingTop: 8,
          },
        }}
        footer={
          <div className='grid grid-cols-2 gap-2 sm:flex sm:justify-end'>
            <Button onClick={handleReset}>
              <RotateCcw className='mr-2 h-4 w-4' />
              {t('Reset')}
            </Button>
            <Button type='primary' onClick={handleApply}>
              <Search className='mr-2 h-4 w-4' />
              {t('Apply Filters')}
            </Button>
          </div>
        }
      >
        <p className='text-muted-foreground mb-3 text-sm'>
          {t(
            props.descriptionKey ??
              'Filter the model analytics view by time range and user.'
          )}
        </p>
        <div className='grid gap-2.5 py-2'>
          <div className='grid gap-2'>
            <label className='flex items-center gap-2 text-sm font-medium'>
              <Calendar className='h-4 w-4' />
              {t('Quick Range')}
            </label>
            <div className='grid grid-cols-2 gap-2 sm:flex'>
              {TIME_RANGE_PRESETS.map((range) => (
                <Button
                  key={range.days}
                  type={selectedRange === range.days ? 'primary' : 'default'}
                  size='small'
                  onClick={() => handleQuickRange(range.days)}
                  className={cn(
                    'flex-1',
                    selectedRange === range.days &&
                      'ring-ring ring-2 ring-offset-2'
                  )}
                >
                  {t(range.label)}
                </Button>
              ))}
            </div>
          </div>

          <SectionDivider label={t('Custom Time Range')} />

          <div className='grid gap-2.5'>
            <div className='grid gap-2'>
              <label className='text-sm font-medium' htmlFor='start_timestamp'>
                {t('Start Time')}
              </label>
              <DateTimePicker
                value={filters.start_timestamp}
                onChange={(date) =>
                  handleChange('start_timestamp', date || undefined)
                }
                placeholder={t('Select start time')}
              />
            </div>

            <div className='grid gap-2'>
              <label className='text-sm font-medium' htmlFor='end_timestamp'>
                {t('End Time')}
              </label>
              <DateTimePicker
                value={filters.end_timestamp}
                onChange={(date) =>
                  handleChange('end_timestamp', date || undefined)
                }
                placeholder={t('Select end time')}
              />
            </div>
          </div>

          <SectionDivider label={t('Chart Settings')} />

          <div className='grid gap-2'>
            <label className='text-sm font-medium' htmlFor='time_granularity'>
              {t('Time Granularity')}
            </label>
            <Select
              id='time_granularity'
              className='w-full'
              placeholder={t('Select time granularity')}
              value={filters.time_granularity}
              onChange={(value) =>
                handleChange('time_granularity', value as TimeGranularity)
              }
              options={TIME_GRANULARITY_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.label),
              }))}
            />
          </div>

          {isAdmin && (
            <>
              <SectionDivider label={t('Admin Only')} />

              <div className='grid gap-2'>
                <label className='text-sm font-medium' htmlFor='username'>
                  {t('Username')}
                </label>
                <Input
                  id='username'
                  placeholder={t('Filter by username')}
                  value={filters.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
