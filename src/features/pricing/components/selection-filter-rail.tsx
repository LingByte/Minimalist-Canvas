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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Filter } from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  ENDPOINT_TYPES,
  FILTER_ALL,
  QUOTA_TYPES,
  getEndpointTypeLabels,
  getQuotaTypeLabels,
} from '../constants'
import { parseTags } from '../lib/filters'
import type { PricingModel, PricingVendor } from '../types'

type Chip = {
  value: string
  label: string
  count?: number
}

function ChipRow(props: {
  label: string
  value: string
  options: Chip[]
  onChange: (value: string) => void
}) {
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='text-muted-foreground w-14 shrink-0 text-[10px] font-semibold tracking-[0.14em] uppercase'>
        {props.label}
      </span>
      <div className='hover-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5'>
        {props.options.map((option) => {
          const active = props.value === option.value
          return (
            <button
              key={option.value}
              type='button'
              onClick={() => props.onChange(option.value)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border/80 bg-background/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
              )}
            >
              <span className='max-w-36 truncate'>{option.label}</span>
              {option.count != null ? (
                <span
                  className={cn(
                    'tabular-nums',
                    active ? 'opacity-70' : 'opacity-50'
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function countBy(
  models: PricingModel[],
  predicate: (model: PricingModel) => boolean
): number {
  let n = 0
  for (const model of models) {
    if (predicate(model)) n += 1
  }
  return n
}

export type SelectionFilterRailProps = {
  models: PricingModel[]
  vendors: PricingVendor[]
  groups: string[]
  tags: string[]
  vendorFilter: string
  groupFilter: string
  quotaTypeFilter: string
  endpointTypeFilter: string
  tagFilter: string
  onVendorChange: (value: string) => void
  onGroupChange: (value: string) => void
  onQuotaTypeChange: (value: string) => void
  onEndpointTypeChange: (value: string) => void
  onTagChange: (value: string) => void
  hasActiveFilters: boolean
  onClearFilters: () => void
}

export function SelectionFilterRail(props: SelectionFilterRailProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const quotaLabels = getQuotaTypeLabels(t)
  const endpointLabels = getEndpointTypeLabels(t)

  const vendorOptions = useMemo<Chip[]>(() => {
    const chips: Chip[] = [
      {
        value: FILTER_ALL,
        label: t('All Vendors'),
        count: props.models.length,
      },
    ]
    for (const vendor of props.vendors) {
      chips.push({
        value: String(vendor.id),
        label: vendor.name,
        count: countBy(props.models, (m) => m.vendor_id === vendor.id),
      })
    }
    return chips
  }, [props.models, props.vendors, t])

  const groupOptions = useMemo<Chip[]>(() => {
    const chips: Chip[] = [
      {
        value: FILTER_ALL,
        label: t('All Groups'),
        count: props.models.length,
      },
    ]
    for (const group of props.groups) {
      chips.push({
        value: group,
        label: group,
        count: countBy(
          props.models,
          (m) => m.enable_groups?.includes(group) ?? false
        ),
      })
    }
    return chips
  }, [props.groups, props.models, t])

  const quotaOptions = useMemo<Chip[]>(
    () => [
      {
        value: QUOTA_TYPES.ALL,
        label: quotaLabels[QUOTA_TYPES.ALL],
        count: props.models.length,
      },
      {
        value: QUOTA_TYPES.TOKEN,
        label: quotaLabels[QUOTA_TYPES.TOKEN],
        count: countBy(props.models, (m) => m.quota_type === 0),
      },
      {
        value: QUOTA_TYPES.REQUEST,
        label: quotaLabels[QUOTA_TYPES.REQUEST],
        count: countBy(props.models, (m) => m.quota_type === 1),
      },
    ],
    [props.models, quotaLabels]
  )

  const endpointOptions = useMemo<Chip[]>(() => {
    const chips: Chip[] = [
      {
        value: ENDPOINT_TYPES.ALL,
        label: endpointLabels[ENDPOINT_TYPES.ALL],
        count: props.models.length,
      },
    ]
    for (const [value, label] of Object.entries(endpointLabels)) {
      if (value === ENDPOINT_TYPES.ALL) continue
      chips.push({
        value,
        label,
        count: countBy(
          props.models,
          (m) => m.supported_endpoint_types?.includes(value) ?? false
        ),
      })
    }
    return chips
  }, [endpointLabels, props.models])

  const tagOptions = useMemo<Chip[]>(() => {
    const chips: Chip[] = [
      {
        value: FILTER_ALL,
        label: t('All Tags'),
        count: props.models.length,
      },
    ]
    for (const tag of props.tags) {
      chips.push({
        value: tag,
        label: tag,
        count: countBy(props.models, (m) =>
          parseTags(m.tags)
            .map((item) => item.toLowerCase())
            .includes(tag.toLowerCase())
        ),
      })
    }
    return chips
  }, [props.models, props.tags, t])

  return (
    <div className='border-border/70 bg-card/70 rounded-xl border shadow-xs backdrop-blur-sm'>
      <div className='flex items-center justify-between gap-3 px-2.5 py-1.5'>
        <button
          type='button'
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className='hover:bg-muted/50 -ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors'
        >
          <Filter className='text-muted-foreground size-3.5 shrink-0' />
          <span className='text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase'>
            {t('Filter rail')}
          </span>
          {props.hasActiveFilters ? (
            <span className='bg-foreground text-background rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums'>
              {t('Active')}
            </span>
          ) : null}
          {expanded ? (
            <ChevronUp className='text-muted-foreground ml-auto size-3.5 shrink-0' />
          ) : (
            <ChevronDown className='text-muted-foreground ml-auto size-3.5 shrink-0' />
          )}
        </button>
        {props.hasActiveFilters ? (
          <button
            type='button'
            onClick={props.onClearFilters}
            className='text-muted-foreground hover:text-foreground shrink-0 text-xs underline-offset-2 hover:underline'
          >
            {t('Clear filters')}
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className='space-y-2.5 border-t border-border/60 px-3 pt-2.5 pb-3'>
          <ChipRow
            label={t('Vendor')}
            value={props.vendorFilter}
            options={vendorOptions}
            onChange={props.onVendorChange}
          />
          <ChipRow
            label={t('Group')}
            value={props.groupFilter}
            options={groupOptions}
            onChange={props.onGroupChange}
          />
          <ChipRow
            label={t('Billing')}
            value={props.quotaTypeFilter}
            options={quotaOptions}
            onChange={props.onQuotaTypeChange}
          />
          <ChipRow
            label={t('Endpoint')}
            value={props.endpointTypeFilter}
            options={endpointOptions}
            onChange={props.onEndpointTypeChange}
          />
          {props.tags.length > 0 ? (
            <ChipRow
              label={t('Tag')}
              value={props.tagFilter}
              options={tagOptions}
              onChange={props.onTagChange}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
