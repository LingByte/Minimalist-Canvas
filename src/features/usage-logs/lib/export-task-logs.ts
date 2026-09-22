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
import { saveAs } from 'file-saver'

import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import { getAllTaskLogs, getUserTaskLogs } from '../api'
import { resolveTaskQuotaChange } from '../components/quota-change-badge'
import type { GetTaskLogsParams, TaskLog } from '../types'

export const TASK_LOG_EXPORT_MAX_ROWS = 5_000
const EXPORT_PAGE_SIZE = 100

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

function formatSignedQuota(change: number): string {
  if (change === 0) return formatLogQuota(0)
  const sign = change > 0 ? '+' : '-'
  return `${sign}${formatLogQuota(Math.abs(change))}`
}

function taskLogToRow(
  log: TaskLog,
  headers: string[],
  includeBalance: boolean,
): Record<string, string> {
  const change = resolveTaskQuotaChange(log)
  const balance = log.user_quota_after ?? log.user_quota
  const values: Record<string, string> = {
    [headers[0]]: formatTimestampToDate(log.submit_time, 'seconds'),
    [headers[1]]: log.finish_time
      ? formatTimestampToDate(log.finish_time, 'seconds')
      : '',
    [headers[2]]: log.task_id || '',
    [headers[3]]: log.platform || '',
    [headers[4]]: log.action || '',
    [headers[5]]:
      log.model || log.properties?.origin_model_name || '',
    [headers[6]]: log.status || '',
    [headers[7]]: log.progress || '',
    [headers[8]]: formatSignedQuota(change),
  }
  let idx = 9
  if (includeBalance) {
    values[headers[idx]] = balance == null ? '' : formatLogQuota(balance)
    idx++
  }
  values[headers[idx]] = log.username || ''
  idx++
  values[headers[idx]] = log.user_id != null ? String(log.user_id) : ''
  idx++
  values[headers[idx]] = log.channel_id != null ? String(log.channel_id) : ''
  idx++
  values[headers[idx]] = (log.fail_reason || '').replaceAll(/\s+/g, ' ').trim()
  return values
}

export function buildTaskLogsCsv(
  logs: TaskLog[],
  headers: string[],
  includeBalance: boolean,
): string {
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const log of logs) {
    const row = taskLogToRow(log, headers, includeBalance)
    lines.push(headers.map((header) => escapeCsvCell(row[header] ?? '')).join(','))
  }
  // UTF-8 BOM so Excel opens Chinese columns correctly.
  return `\uFEFF${lines.join('\r\n')}`
}

export async function fetchTaskLogsForExport(config: {
  isAdmin: boolean
  params: Omit<GetTaskLogsParams, 'p' | 'page_size'>
  maxRows?: number
}): Promise<{ items: TaskLog[]; truncated: boolean; total: number }> {
  const maxRows = config.maxRows ?? TASK_LOG_EXPORT_MAX_ROWS
  const items: TaskLog[] = []
  let page = 1
  let total = 0

  while (items.length < maxRows) {
    const response = config.isAdmin
      ? await getAllTaskLogs({
          ...config.params,
          p: page,
          page_size: EXPORT_PAGE_SIZE,
        })
      : await getUserTaskLogs({
          ...config.params,
          p: page,
          page_size: EXPORT_PAGE_SIZE,
        })

    if (!response.success) {
      throw new Error(response.message || 'Failed to load logs')
    }

    const batch = (response.data?.items || []) as TaskLog[]
    total = response.data?.total ?? total
    items.push(...batch)

    if (batch.length < EXPORT_PAGE_SIZE || items.length >= total) {
      break
    }
    page += 1
  }

  const truncated = items.length > maxRows || (total > 0 && total > maxRows)
  return {
    items: items.slice(0, maxRows),
    truncated,
    total,
  }
}

export function downloadTaskLogsExcel(
  logs: TaskLog[],
  headers: string[],
  includeBalance: boolean,
) {
  const csv = buildTaskLogsCsv(logs, headers, includeBalance)
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(/[:T]/g, '-')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  saveAs(blob, `task-logs-${stamp}.csv`)
}
