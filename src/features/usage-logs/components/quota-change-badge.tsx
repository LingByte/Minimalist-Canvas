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
import { formatLogQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Signed wallet delta: negative = charged, positive = refunded. */
export function resolveTaskQuotaChange(task: {
  quota?: number
  quota_change?: number
}): number {
  if (typeof task.quota_change === 'number' && task.quota_change !== 0) {
    return task.quota_change
  }
  const quota = Number(task.quota ?? 0)
  if (quota > 0) return -quota
  return typeof task.quota_change === 'number' ? task.quota_change : 0
}

export function QuotaChangeBadge(props: { change: number }) {
  if (!props.change) {
    return <span className='text-muted-foreground/60 text-xs'>-</span>
  }

  const positive = props.change > 0
  const label = `${positive ? '+' : '-'}${formatLogQuota(Math.abs(props.change))}`

  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit items-center rounded-md border px-2 [font-family:var(--font-body)] text-sm leading-none font-semibold tabular-nums',
        positive
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-destructive/30 bg-destructive/10 text-destructive'
      )}
      title={label}
    >
      {label}
    </span>
  )
}
