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
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { type Table } from '@tanstack/react-table'
import { Button, Modal, Select } from 'antd'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AdminUserSearchSelect } from '@/components/admin-user-search-select'

import { TASK_STATUS } from '../constants'
import { adminRefreshTaskFromUpstream } from '../api'
import { buildSearchParams } from '../lib/filter'
import {
  downloadTaskLogsExcel,
  fetchTaskLogsForExport,
  TASK_LOG_EXPORT_MAX_ROWS,
} from '../lib/export-task-logs'
import { taskStatusMapper } from '../lib/mappers'
import { buildBaseParams, getDefaultTimeRange } from '../lib/utils'
import type { DrawingLogFilters, LogCategory, TaskLogFilters } from '../types'
import { CompactDateTimeRangePicker } from './compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from './logs-filter-toolbar'
import {
  useUsageLogsNavigate,
  useUsageLogsSearch,
} from '../hooks/use-usage-logs-route'
import { useLogsViewScope } from './usage-logs-provider'


type TaskLikeLogCategory = Extract<LogCategory, 'drawing' | 'task'>
type TaskLogsFilters = DrawingLogFilters | TaskLogFilters

interface TaskLogsFilterBarProps<TData> {
  table: Table<TData>
  logCategory: TaskLikeLogCategory
}

function getFilterValue(
  filters: TaskLogsFilters,
  logCategory: TaskLikeLogCategory
): string {
  if (logCategory === 'drawing') {
    return (filters as DrawingLogFilters).mjId || ''
  }
  return (filters as TaskLogFilters).taskId || ''
}

function setFilterValue(
  filters: TaskLogsFilters,
  logCategory: TaskLikeLogCategory,
  value: string
): TaskLogsFilters {
  if (logCategory === 'drawing') {
    return { ...filters, mjId: value }
  }
  return { ...filters, taskId: value }
}

export function TaskLogsFilterBar<TData>(props: TaskLogsFilterBarProps<TData>) {
  const { t } = useTranslation()
  const navigate = useUsageLogsNavigate()
  const queryClient = useQueryClient()
  const searchParams = useUsageLogsSearch()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const fetchingLogs = useIsFetching({ queryKey: ['logs'] })
  const [exporting, setExporting] = useState(false)
  const [pullProgress, setPullProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  const [filters, setFilters] = useState<TaskLogsFilters>(() => {
    const { start, end } = getDefaultTimeRange()
    return { startTime: start, endTime: end }
  })

  useEffect(() => {
    const { start, end } = getDefaultTimeRange()
    const baseFilters = {
      startTime: searchParams.startTime
        ? new Date(Number(searchParams.startTime))
        : start,
      endTime: searchParams.endTime ? new Date(Number(searchParams.endTime)) : end,
      ...(searchParams.channel
        ? { channel: String(searchParams.channel) }
        : {}),
      ...(typeof searchParams.userId === 'number'
        ? { userId: searchParams.userId }
        : {}),
    }
    const next: TaskLogsFilters =
      props.logCategory === 'drawing'
        ? {
            ...baseFilters,
            ...(searchParams.filter ? { mjId: searchParams.filter } : {}),
          }
        : {
            ...baseFilters,
            ...(searchParams.filter ? { taskId: searchParams.filter } : {}),
            ...(searchParams.status
              ? { status: String(searchParams.status) }
              : {}),
            ...(searchParams.missingResult === '1'
              ? { missingResult: true }
              : {}),
          }

    setFilters(next)
  }, [
    props.logCategory,
    searchParams.startTime,
    searchParams.endTime,
    searchParams.channel,
    searchParams.userId,
    searchParams.filter,
    searchParams.status,
    searchParams.missingResult,
  ])

  const applyFilters = useCallback(
    (nextFilters: TaskLogsFilters) => {
      const filterParams = buildSearchParams(nextFilters, props.logCategory)
      navigate({
        to: '/usage-logs/$section',
        params: { section: props.logCategory },
        search: {
          ...filterParams,
          page: 1,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
    [navigate, props.logCategory, queryClient]
  )

  const handleChange = useCallback(
    (
      field: keyof TaskLogsFilters,
      value: Date | string | number | undefined
    ) => {
      setFilters((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const handleApply = useCallback(() => {
    applyFilters(filters)
  }, [applyFilters, filters])

  const handleReset = useCallback(() => {
    const { start, end } = getDefaultTimeRange()
    const resetFilters: TaskLogsFilters = { startTime: start, endTime: end }
    setFilters(resetFilters)
    applyFilters(resetFilters)
  }, [applyFilters])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleApply()
    },
    [handleApply]
  )

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilters((prev) => setFilterValue(prev, props.logCategory, value))
    },
    [props.logCategory]
  )

  const handleUserChange = useCallback(
    (nextUserId: number | undefined) => {
      setFilters((prev) => {
        const next = { ...prev, userId: nextUserId }
        queueMicrotask(() => applyFilters(next))
        return next
      })
    },
    [applyFilters]
  )

  const handleExport = useCallback(async () => {
    if (props.logCategory !== 'task' || exporting) return
    setExporting(true)
    try {
      const filterParams = buildSearchParams(filters, 'task')
      const baseParams = buildBaseParams({
        page: 1,
        pageSize: 100,
        searchParams: filterParams,
        useMilliseconds: false,
      })
      const { items, truncated } = await fetchTaskLogsForExport({
        isAdmin,
        params: {
          channel_id: baseParams.channel_id,
          user_id: baseParams.user_id,
          start_timestamp: baseParams.start_timestamp,
          end_timestamp: baseParams.end_timestamp,
          task_id: (filterParams.filter as string | undefined) || undefined,
          status: (filterParams.status as string | undefined) || undefined,
          missing_result:
            filterParams.missingResult === '1' ? '1' : undefined,
        },
      })
      if (items.length === 0) {
        toast.message(t('No data to export'))
        return
      }
      const headers = [
        t('Submit Time'),
        t('Finish Time'),
        t('Task ID'),
        t('Platform'),
        t('Action'),
        t('Model'),
        t('Status'),
        t('Progress'),
        t('Amount change'),
      ]
      if (isAdmin) {
        headers.push(t('User balance'))
      }
      headers.push(
        t('Username'),
        t('User ID'),
        t('Channel ID'),
        t('Fail Reason'),
      )
      downloadTaskLogsExcel(items, headers, isAdmin)
      if (truncated) {
        toast.success(
          t('Exported {{count}} rows (limited to {{max}})', {
            count: items.length,
            max: TASK_LOG_EXPORT_MAX_ROWS,
          })
        )
      } else {
        toast.success(t('Exported {{count}} rows', { count: items.length }))
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Export failed')
      )
    } finally {
      setExporting(false)
    }
  }, [exporting, filters, isAdmin, props.logCategory, t])

  const pullMatchingTasks = useCallback(async () => {
    if (pullProgress || props.logCategory !== 'task') return
    setPullProgress({ done: 0, total: 0 })
    try {
      const filterParams = buildSearchParams(filters, 'task')
      const baseParams = buildBaseParams({
        page: 1,
        pageSize: 100,
        searchParams: filterParams,
        useMilliseconds: false,
      })
      const { items, truncated } = await fetchTaskLogsForExport({
        isAdmin: true,
        maxRows: 200,
        params: {
          channel_id: baseParams.channel_id,
          user_id: baseParams.user_id,
          start_timestamp: baseParams.start_timestamp,
          end_timestamp: baseParams.end_timestamp,
          task_id: (filterParams.filter as string | undefined) || undefined,
          status: (filterParams.status as string | undefined) || undefined,
          missing_result:
            filterParams.missingResult === '1' ? '1' : undefined,
        },
      })
      const queue = items.filter((item) => item.task_id)
      if (queue.length === 0) {
        toast.message(t('No tasks to pull'))
        return
      }
      setPullProgress({ done: 0, total: queue.length })
      let fetched = 0
      let created = 0
      let failed = 0
      let nextIndex = 0
      const workers = Array.from(
        { length: Math.min(3, queue.length) },
        async () => {
          while (nextIndex < queue.length) {
            const current = queue[nextIndex]
            nextIndex += 1
            const taskId = current.task_id
            if (!taskId) continue
            try {
              const result = await adminRefreshTaskFromUpstream(taskId)
              if (result.fetched) fetched += 1
              if (result.asset_created) created += 1
              if (result.fetch_error) failed += 1
            } catch {
              failed += 1
            }
            setPullProgress((currentProgress) =>
              currentProgress
                ? {
                    done: currentProgress.done + 1,
                    total: currentProgress.total,
                  }
                : currentProgress
            )
          }
        }
      )
      await Promise.all(workers)
      await queryClient.invalidateQueries({ queryKey: ['logs'] })
      toast.success(
        t(
          'Pulled {{fetched}} tasks from upstream, created {{created}} generation assets',
          { fetched, created }
        )
      )
      if (failed > 0) {
        toast.error(t('{{failed}} tasks failed to pull', { failed }))
      }
      if (truncated) {
        toast.message(
          t('Only the first {{max}} matching tasks were pulled', { max: 200 })
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Pull failed'))
    } finally {
      setPullProgress(null)
    }
  }, [filters, props.logCategory, pullProgress, queryClient, t])

  const filterValue = getFilterValue(filters, props.logCategory)
  const taskStatus =
    props.logCategory === 'task'
      ? (filters as TaskLogFilters).status || ''
      : ''
  const missingResult =
    props.logCategory === 'task' &&
    Boolean((filters as TaskLogFilters).missingResult)
  const statusOptions = useMemo(
    () => [
      { value: '', label: t('All statuses') },
      ...Object.values(TASK_STATUS).map((status) => ({
        value: status,
        label: t(taskStatusMapper.getLabel(status, status)),
      })),
    ],
    [t]
  )
  const placeholder =
    props.logCategory === 'drawing'
      ? t('Filter by MjProxy task ID')
      : t('Filter by task ID')
  const hasAdditionalFilters =
    !!filterValue ||
    !!taskStatus ||
    missingResult ||
    !!filters.channel ||
    filters.userId != null
  const dateRangeFilter = (
    <LogsFilterField className='sm:col-span-2'>
      <CompactDateTimeRangePicker
        start={filters.startTime}
        end={filters.endTime}
        onChange={({ start, end }) => {
          handleChange('startTime', start)
          handleChange('endTime', end)
        }}
      />
    </LogsFilterField>
  )
  const taskIdFilter = (
    <LogsFilterField>
      <LogsFilterInput
        aria-label={t('Task ID')}
        placeholder={placeholder}
        value={filterValue}
        onChange={(e) => handleFilterChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  )
  const statusFilter =
    props.logCategory === 'task' ? (
      <LogsFilterField>
        <Select
          className='w-full'
          size='small'
          allowClear
          placeholder={t('Status')}
          value={taskStatus || undefined}
          options={statusOptions.filter((item) => item.value)}
          onChange={(value) => {
            setFilters((prev) => {
              const next = {
                ...prev,
                status: value || undefined,
              } as TaskLogsFilters
              queueMicrotask(() => applyFilters(next))
              return next
            })
          }}
        />
      </LogsFilterField>
    ) : null
  const missingResultFilter =
    props.logCategory === 'task' ? (
      <LogsFilterField>
        <Select
          className='w-full'
          size='small'
          allowClear
          placeholder={t('Result')}
          value={missingResult ? '1' : undefined}
          options={[{ value: '1', label: t('No result') }]}
          onChange={(value) => {
            setFilters((prev) => {
              const next = {
                ...prev,
                missingResult: value === '1',
              } as TaskLogsFilters
              queueMicrotask(() => applyFilters(next))
              return next
            })
          }}
        />
      </LogsFilterField>
    ) : null
  const userFilter = isAdmin ? (
    <LogsFilterField>
      <AdminUserSearchSelect
        className='w-full max-w-full'
        size='small'
        placeholder={t('Select user')}
        value={filters.userId}
        onChange={handleUserChange}
      />
    </LogsFilterField>
  ) : null
  const channelFilter = isAdmin ? (
    <LogsFilterField>
      <LogsFilterInput
        placeholder={t('Channel ID')}
        value={filters.channel || ''}
        onChange={(e) => handleChange('channel', e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  ) : null

  const exportButton =
    props.logCategory === 'task' ? (
      <Button
        type='default'
        size='small'
        onClick={() => void handleExport()}
        disabled={exporting || fetchingLogs > 0}
        icon={
          exporting ? (
            <Loader2 className='size-3.5 animate-spin' />
          ) : (
            <Download className='size-3.5' />
          )
        }
      >
        {exporting ? t('Exporting...') : t('Export Excel')}
      </Button>
    ) : null

  const batchPullButton =
    props.logCategory === 'task' && isAdmin ? (
      <Button
        type='primary'
        size='small'
        loading={pullProgress != null}
        disabled={pullProgress != null || fetchingLogs > 0}
        icon={pullProgress ? undefined : <RefreshCw className='size-3.5' />}
        onClick={() => {
          Modal.confirm({
            title: t('Pull all from upstream'),
            content: t(
              'Pull every task matching the current filters from upstream and create any missing generation assets.'
            ),
            okText: t('Pull from upstream'),
            cancelText: t('Cancel'),
            onOk: () => {
              void pullMatchingTasks()
            },
          })
        }}
      >
        {pullProgress && pullProgress.total > 0
          ? t('Pulling {{done}}/{{total}}', {
              done: pullProgress.done,
              total: pullProgress.total,
            })
          : t('Pull all from upstream')}
      </Button>
    ) : null

  return (
    <LogsFilterToolbar
      table={props.table}
      filtersGridClassName='sm:grid-cols-2 xl:grid-cols-4'
      primaryFilters={
        <>
          {dateRangeFilter}
          {taskIdFilter}
          {statusFilter}
          {missingResultFilter}
          {userFilter}
          {channelFilter}
        </>
      }
      mobilePinnedFilters={dateRangeFilter}
      mobileFilters={
        <>
          {taskIdFilter}
          {statusFilter}
          {missingResultFilter}
          {userFilter}
          {channelFilter}
        </>
      }
      mobileFilterCount={
        [filterValue, taskStatus, missingResult, filters.userId, filters.channel].filter(
          Boolean
        ).length
      }
      actionStart={
        <>
          {batchPullButton}
          {exportButton}
        </>
      }
      hasActiveFilters={hasAdditionalFilters}
      onSearch={handleApply}
      searchLoading={fetchingLogs > 0}
      onReset={handleReset}
    />
  )
}
