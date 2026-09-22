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
import { useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { NavigateFn } from '@/hooks/use-table-url-state'

import type { UsageLogsSectionId } from '../section-registry'

const NUMBER_KEYS = new Set([
  'page',
  'pageSize',
  'startTime',
  'endTime',
  'userId',
])

function parseSearchParam(key: string, value: string): unknown {
  try {
    const parsed = JSON.parse(value)
    return parsed
  } catch {
    if (NUMBER_KEYS.has(key)) {
      const n = Number(value)
      if (!Number.isNaN(n)) return n
    }
    return value
  }
}

function serializeSearchValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export type UsageLogsSearch = {
  page?: number
  pageSize?: number
  type?: string | string[]
  filter?: string
  status?: string
  missingResult?: string
  model?: string
  token?: string
  channel?: string
  group?: string
  username?: string
  userId?: number
  requestId?: string
  upstreamRequestId?: string
  startTime?: number
  endTime?: number
  [key: string]: unknown
}

export type UsageLogsNavigateOpts = {
  to?: string
  params?: { section?: UsageLogsSectionId | string }
  search?:
    | true
    | UsageLogsSearch
    | ((prev: UsageLogsSearch) => Partial<UsageLogsSearch> | UsageLogsSearch)
  replace?: boolean
}

export function useUsageLogsParams() {
  return useParams<{ section?: string }>()
}

export function useUsageLogsSearch(): UsageLogsSearch {
  const [searchParams] = useSearchParams()
  return useMemo(() => {
    const record: UsageLogsSearch = {}
    for (const [key, value] of searchParams.entries()) {
      ;(record as Record<string, unknown>)[key] = parseSearchParam(key, value)
    }
    return record
  }, [searchParams])
}

export function useUsageLogsNavigate() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useParams<{ section?: string }>()

  return useCallback(
    (opts: UsageLogsNavigateOpts) => {
      const section =
        opts.params?.section ?? params.section ?? 'task'
      const targetPath =
        opts.to === '/usage-logs/$section' || opts.to == null
          ? `/usage-logs/${section}`
          : opts.to.replace('$section', String(section))

      if (opts.search === undefined) {
        navigate(
          { pathname: targetPath, search: searchParams.toString() },
          { replace: opts.replace ?? false }
        )
        return
      }

      const prevRecord: UsageLogsSearch = {}
      for (const [key, value] of searchParams.entries()) {
        ;(prevRecord as Record<string, unknown>)[key] = parseSearchParam(key, value)
      }
      const patch =
        typeof opts.search === 'function'
          ? opts.search(prevRecord)
          : opts.search === true
            ? prevRecord
            : opts.search

      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null) continue
        next.set(key, serializeSearchValue(value))
      }

      // Same path → update query only; section change → full navigate.
      if (targetPath === `/usage-logs/${params.section}`) {
        setSearchParams(next, { replace: opts.replace ?? false })
      } else {
        navigate(
          { pathname: targetPath, search: next.toString() },
          { replace: opts.replace ?? false }
        )
      }
    },
    [navigate, params.section, searchParams, setSearchParams]
  )
}

/** Adapter matching useTableUrlState NavigateFn shape. */
export function useUsageLogsTableNavigate(): NavigateFn {
  const navigate = useUsageLogsNavigate()
  return useCallback(
    (opts) => {
      navigate({ search: opts.search, replace: opts.replace })
    },
    [navigate]
  )
}
