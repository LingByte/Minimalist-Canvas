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
import { Filter, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Select, Tag } from 'antd'

import type {
  FlowNodeFilter,
  FlowNodeFilterOption,
  FlowNodeKind,
} from '@/features/dashboard/types'

interface FlowNodeFilterControlProps {
  stages: FlowNodeKind[]
  stageLabels: Record<FlowNodeKind, string>
  metricLabel: string
  formatMetricValue: (value: number) => string
  options: FlowNodeFilterOption[]
  selectedNodes: FlowNodeFilter[]
  onToggleNode: (filter: FlowNodeFilter) => void
  onRemoveNode: (filter: FlowNodeFilter) => void
  onClearNodes: () => void
}

function flowNodeFilterKey(filter: FlowNodeFilter): string {
  return `${filter.kind}\u0000${filter.id}`
}

function parseFlowNodeFilterKey(key: string): FlowNodeFilter | null {
  const sep = key.indexOf('\u0000')
  if (sep < 0) return null
  return {
    kind: key.slice(0, sep) as FlowNodeKind,
    id: key.slice(sep + 1),
  }
}

export function FlowNodeFilterControl(props: FlowNodeFilterControlProps) {
  const { t } = useTranslation()
  const optionLabels = useMemo(() => {
    const labels = new Map<string, FlowNodeFilterOption>()
    for (const option of props.options) {
      labels.set(
        flowNodeFilterKey({ kind: option.kind, id: option.value }),
        option
      )
    }
    return labels
  }, [props.options])
  const optionsByStage = useMemo(
    () =>
      props.stages
        .map((stage) => ({
          stage,
          options: props.options.filter((option) => option.kind === stage),
        }))
        .filter((group) => group.options.length > 0),
    [props.options, props.stages]
  )
  const selectedOptions = props.selectedNodes.map((filter) => {
    const option = optionLabels.get(flowNodeFilterKey(filter))
    return {
      ...filter,
      label: option?.label ?? filter.id,
    }
  })
  const selectedCount = selectedOptions.length
  const selectedKeys = selectedOptions.map(flowNodeFilterKey)

  const selectOptions = optionsByStage.map((group) => ({
    label: t(props.stageLabels[group.stage]),
    options: group.options.map((option) => {
      const key = flowNodeFilterKey({
        kind: option.kind,
        id: option.value,
      })
      const metricValueLabel = props.formatMetricValue(option.valueRaw)
      return {
        value: key,
        label: option.label,
        searchLabel: `${t(props.stageLabels[group.stage])} ${option.label} ${props.metricLabel} ${metricValueLabel}`,
        color: option.color,
        metricValueLabel,
      }
    }),
  }))

  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <span className='text-muted-foreground text-xs font-medium'>
        {t('Node filters')}
      </span>
      <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
        <Select
          mode='multiple'
          allowClear
          showSearch
          maxTagCount={0}
          placeholder={selectedCount > 0 ? t('Selected nodes') : t('All nodes')}
          aria-label={t('Filter by node')}
          className='min-w-[12rem]'
          popupMatchSelectWidth={false}
          dropdownStyle={{ minWidth: 'min(28rem, calc(100vw - 2rem))' }}
          value={selectedKeys}
          optionFilterProp='searchLabel'
          onChange={(keys: string[]) => {
            const next = new Set(keys)
            const prev = new Set(selectedKeys)
            for (const key of next) {
              if (!prev.has(key)) {
                const filter = parseFlowNodeFilterKey(key)
                if (filter) props.onToggleNode(filter)
              }
            }
            for (const key of prev) {
              if (!next.has(key)) {
                const filter = parseFlowNodeFilterKey(key)
                if (filter) props.onRemoveNode(filter)
              }
            }
          }}
          onClear={props.onClearNodes}
          options={selectOptions}
          optionRender={(option) => {
            const data = option.data as {
              color?: string
              metricValueLabel?: string
              label?: string
            }
            return (
              <div className='flex min-w-0 items-center gap-2'>
                <span
                  className='size-2.5 shrink-0 rounded-full'
                  style={{ backgroundColor: data.color }}
                  aria-hidden='true'
                />
                <span className='min-w-0 flex-1 truncate'>{data.label}</span>
                <span className='text-muted-foreground flex shrink-0 items-center gap-1 text-xs'>
                  <span>{props.metricLabel}</span>
                  <span className='font-mono'>{data.metricValueLabel}</span>
                </span>
              </div>
            )
          }}
          prefix={<Filter className='size-3.5' aria-hidden='true' />}
        />
        {selectedCount > 0 ? <Tag>{selectedCount}</Tag> : null}

        {selectedOptions.map((option) => (
          <Tag
            key={flowNodeFilterKey(option)}
            closable
            className='max-w-[14rem]'
            onClose={(e) => {
              e.preventDefault()
              props.onRemoveNode({ kind: option.kind, id: option.id })
            }}
            closeIcon={<X className='size-3' aria-hidden='true' />}
          >
            <span className='truncate'>
              {t(props.stageLabels[option.kind])}: {option.label}
            </span>
          </Tag>
        ))}

        {selectedCount > 1 && (
          <Button type='text' size='small' onClick={props.onClearNodes}>
            {t('Clear')}
          </Button>
        )}
      </div>
    </div>
  )
}
