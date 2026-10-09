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
import { TASK_STATUS } from '../constants'
import { adminRefreshTaskFromUpstream } from '../api'
import type { TaskLog } from '../types'

const SETTLED_TASK_STATUSES = new Set<string>([
  TASK_STATUS.SUCCESS,
  TASK_STATUS.FAILURE,
])

export type UpstreamPullProgress = { done: number; total: number }

export async function pullTaskLogsFromUpstream(
  items: Pick<TaskLog, 'task_id' | 'status'>[],
  onProgress?: (progress: UpstreamPullProgress) => void
): Promise<{
  fetched: number
  created: number
  failed: number
  skippedSettled: number
  queueSize: number
}> {
  const skippedSettled = items.filter(
    (item) =>
      item.task_id && SETTLED_TASK_STATUSES.has(String(item.status || ''))
  ).length
  const queue = items.filter(
    (item) =>
      item.task_id && !SETTLED_TASK_STATUSES.has(String(item.status || ''))
  )
  if (queue.length === 0) {
    return {
      fetched: 0,
      created: 0,
      failed: 0,
      skippedSettled,
      queueSize: 0,
    }
  }

  onProgress?.({ done: 0, total: queue.length })
  let fetched = 0
  let created = 0
  let failed = 0
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
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
      onProgress?.({ done: Math.min(nextIndex, queue.length), total: queue.length })
    }
  })
  await Promise.all(workers)
  return { fetched, created, failed, skippedSettled, queueSize: queue.length }
}
