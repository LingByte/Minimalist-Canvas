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
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, formatRequestPrice } from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'

function shortPrice(
  model: PricingModel,
  opts: {
    tokenUnit: TokenUnit
    showRechargePrice: boolean
    priceRate: number
    usdExchangeRate: number
    selectedGroup?: string
  }
): string {
  const isDynamic =
    model.billing_mode === 'tiered_expr' && Boolean(model.billing_expr)
  if (isDynamic) {
    const summary = getDynamicPricingSummary(model, {
      tokenUnit: opts.tokenUnit,
      showRechargePrice: opts.showRechargePrice,
      priceRate: opts.priceRate,
      usdExchangeRate: opts.usdExchangeRate,
      groupRatioMultiplier: getDynamicDisplayGroupRatio(
        model,
        opts.selectedGroup
      ),
    })
    if (summary?.isSpecialExpression) return 'expr'
    if (summary?.primaryEntries?.[0]?.formatted) {
      return summary.primaryEntries[0].formatted
    }
    return 'dynamic'
  }
  if (isTokenBasedModel(model)) {
    return formatPrice(
      model,
      'input',
      opts.tokenUnit,
      opts.showRechargePrice,
      opts.priceRate,
      opts.usdExchangeRate,
      opts.selectedGroup
    )
  }
  return formatRequestPrice(
    model,
    opts.showRechargePrice,
    opts.priceRate,
    opts.usdExchangeRate,
    opts.selectedGroup
  )
}

export type SelectionModelListProps = {
  models: PricingModel[]
  selectedModelName: string | null
  onSelect: (modelName: string) => void
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  priceRate?: number
  usdExchangeRate?: number
  selectedGroup?: string
}

export function SelectionModelList(props: SelectionModelListProps) {
  const { t } = useTranslation()
  const parentRef = useRef<HTMLDivElement>(null)
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const showRechargePrice = props.showRechargePrice ?? false
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1

  const virtualizer = useVirtualizer({
    count: props.models.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 12,
  })

  if (props.models.length === 0) {
    return (
      <div className='text-muted-foreground flex h-full items-center justify-center p-8 text-sm'>
        {t('No models match your current filters.')}
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className='hover-scrollbar h-full min-h-0 overflow-y-auto'
      role='listbox'
      aria-label={t('Model list')}
    >
      <div
        className='relative w-full'
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const model = props.models[item.index]
          if (!model) return null
          const name = model.model_name
          const selected = props.selectedModelName === name
          const iconKey = model.icon || model.vendor_icon
          const icon = iconKey ? getLobeIcon(iconKey, 22) : null
          const price = shortPrice(model, {
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            selectedGroup: props.selectedGroup,
          })

          return (
            <button
              key={name}
              type='button'
              role='option'
              aria-selected={selected}
              onClick={() => onSelectSafe(props.onSelect, name)}
              className={cn(
                'absolute inset-x-0 flex items-center gap-3 border-b px-3 text-left transition-colors',
                selected
                  ? 'border-l-foreground bg-foreground/[0.06] border-l-2'
                  : 'hover:bg-muted/40 border-l-2 border-l-transparent'
              )}
              style={{
                height: `${item.size}px`,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <span className='bg-muted/70 flex size-9 shrink-0 items-center justify-center rounded-lg border'>
                {icon || (
                  <span className='text-muted-foreground text-xs font-semibold'>
                    {name?.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block truncate font-mono text-[13px] font-medium tracking-tight'>
                  {name}
                </span>
                {model.vendor_name ? (
                  <span className='text-muted-foreground mt-0.5 block truncate text-[11px]'>
                    {model.vendor_name}
                    {model.enable_groups?.[0]
                      ? ` · ${model.enable_groups[0]}`
                      : ''}
                  </span>
                ) : null}
              </span>
              <span className='shrink-0 text-right'>
                <span className='block font-mono text-[12px] tabular-nums'>
                  {price}
                </span>
                <span className='text-muted-foreground block text-[10px] tracking-wide uppercase'>
                  {isTokenBasedModel(model) ? t('Input') : t('Per request')}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function onSelectSafe(onSelect: (name: string) => void, name: string | undefined) {
  if (!name) return
  onSelect(name)
}
