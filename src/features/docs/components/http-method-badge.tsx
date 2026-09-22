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
import { cn } from '@/lib/utils'

const METHOD_CLASS: Record<string, string> = {
  GET: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  POST: 'bg-blue-500/12 text-blue-700 dark:text-blue-400',
  PUT: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  PATCH: 'bg-orange-500/12 text-orange-700 dark:text-orange-400',
  DELETE: 'bg-red-500/12 text-red-700 dark:text-red-400',
}

export function HttpMethodBadge(props: {
  method: string
  className?: string
}) {
  const method = props.method.toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-11 items-center justify-center rounded-md px-1.5 font-mono text-[10px] font-semibold tracking-wide',
        METHOD_CLASS[method] ?? 'bg-muted text-muted-foreground',
        props.className
      )}
    >
      {method}
    </span>
  )
}
