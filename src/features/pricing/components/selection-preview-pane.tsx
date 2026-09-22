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
import { Copy, PanelRightOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from 'antd'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import type { PricingModel, TokenUnit } from '../types'
import { ModelDetailsContent } from './model-details'

export type SelectionPreviewPaneProps = {
  model: PricingModel | null
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  endpointMap: Record<string, { path?: string; method?: string }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  onOpenDetails?: () => void
}

export function SelectionPreviewPane(props: SelectionPreviewPaneProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const model = props.model

  if (!model) {
    return (
      <div className='flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 p-8 text-center'>
        <div className='border-border/80 text-muted-foreground rounded-xl border border-dashed px-6 py-10'>
          <div className='font-mono text-sm tracking-tight'>
            {t('Select a model')}
          </div>
          <p className='text-muted-foreground mt-2 max-w-xs text-xs leading-relaxed'>
            {t(
              'Pick a row on the left to inspect pricing, endpoints, and capabilities.'
            )}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='border-border/70 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5'>
        <div className='text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase'>
          {t('Inspector')}
        </div>
        <div className='flex items-center gap-1.5'>
          <Button
            size='small'
            icon={<Copy className='size-3.5' />}
            onClick={() => copyToClipboard(model.model_name || '')}
          >
            {t('Copy ID')}
          </Button>
          <Button
            size='small'
            type='primary'
            icon={<PanelRightOpen className='size-3.5' />}
            onClick={props.onOpenDetails}
          >
            {t('Details')}
          </Button>
        </div>
      </div>

      <div className='hover-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5'>
        <ModelDetailsContent
          model={model}
          groupRatio={props.groupRatio}
          usableGroup={props.usableGroup}
          endpointMap={props.endpointMap}
          autoGroups={props.autoGroups}
          priceRate={props.priceRate}
          usdExchangeRate={props.usdExchangeRate}
          tokenUnit={props.tokenUnit}
          showRechargePrice={props.showRechargePrice}
        />
      </div>
    </div>
  )
}
