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
import { Collapse, Button, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
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

type FilterOption = {
  value: string
  label: string
  count?: number
  suffix?: string
  icon?: ReactNode
}

export interface PricingSidebarProps {
  quotaTypeFilter: string
  endpointTypeFilter: string
  vendorFilter: string
  groupFilter: string
  tagFilter: string
  onQuotaTypeChange: (value: string) => void
  onEndpointTypeChange: (value: string) => void
  onVendorChange: (value: string) => void
  onGroupChange: (value: string) => void
  onTagChange: (value: string) => void
  vendors: PricingVendor[]
  groups: string[]
  groupRatios?: Record<string, number>
  tags: string[]
  models: PricingModel[]
  hasActiveFilters: boolean
  onClearFilters: () => void
  className?: string
}

function countBy(
  models: PricingModel[],
  predicate: (model: PricingModel) => boolean
): number {
  return models.reduce((count, model) => count + (predicate(model) ? 1 : 0), 0)
}

function formatGroupRatio(ratio: number | undefined): string | undefined {
  if (ratio == null) return undefined
  const formatted = Number.isInteger(ratio)
    ? ratio.toString()
    : ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `x${formatted}`
}

function FilterChips(props: {
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {props.options.map((option) => {
        const active = props.value === option.value
        return (
          <button
            key={option.value}
            type='button'
            onClick={() => props.onChange(option.value)}
            title={option.label}
            style={{
              display: 'inline-flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              maxWidth: '100%',
              margin: 0,
              whiteSpace: 'nowrap',
              lineHeight: 1,
              cursor: 'pointer',
              border: active
                ? '1px solid var(--pricing-active)'
                : '1px solid var(--pricing-border)',
              background: active
                ? 'var(--pricing-fill)'
                : 'var(--pricing-panel)',
              color: active ? 'var(--pricing-active)' : 'var(--pricing-muted)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {option.icon ? (
              <span
                aria-hidden
                style={{
                  display: 'inline-flex',
                  flex: '0 0 auto',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 14,
                  height: 14,
                  overflow: 'hidden',
                  lineHeight: 0,
                }}
                className='[&>svg]:!block [&>svg]:!h-3.5 [&>svg]:!w-3.5 [&>*]:!h-3.5 [&>*]:!w-3.5'
              >
                {option.icon}
              </span>
            ) : null}
            <span
              style={{
                display: 'inline-block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 140,
              }}
            >
              {option.label}
            </span>
            {(option.suffix || option.count != null) && (
              <span
                style={{
                  display: 'inline-block',
                  flex: '0 0 auto',
                  opacity: 0.7,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {option.suffix ?? option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PricingSidebar(props: PricingSidebarProps) {
  const { t } = useTranslation()
  const quotaTypeLabels = getQuotaTypeLabels(t)
  const endpointTypeLabels = getEndpointTypeLabels(t)

  const vendorOptions: FilterOption[] = [
    {
      value: FILTER_ALL,
      label: t('All Vendors'),
      count: props.models.length,
    },
    ...props.vendors
      .map((vendor) => ({
        value: vendor.name,
        label: vendor.name,
        count: countBy(
          props.models,
          (model) => model.vendor_name === vendor.name
        ),
        icon: vendor.icon ? getLobeIcon(vendor.icon, 14) : undefined,
      }))
      .filter((vendor) => vendor.count > 0),
  ]

  const groupOptions: FilterOption[] = [
    { value: FILTER_ALL, label: t('All Groups') },
    ...props.groups.map((group) => ({
      value: group,
      label: group,
      suffix: formatGroupRatio(props.groupRatios?.[group]),
    })),
  ]

  const quotaOptions: FilterOption[] = [
    {
      value: QUOTA_TYPES.ALL,
      label: quotaTypeLabels[QUOTA_TYPES.ALL],
      count: props.models.length,
    },
    {
      value: QUOTA_TYPES.TOKEN,
      label: quotaTypeLabels[QUOTA_TYPES.TOKEN],
      count: countBy(props.models, (model) => model.quota_type === 0),
    },
    {
      value: QUOTA_TYPES.REQUEST,
      label: quotaTypeLabels[QUOTA_TYPES.REQUEST],
      count: countBy(props.models, (model) => model.quota_type === 1),
    },
  ]

  const tagOptions: FilterOption[] = [
    {
      value: FILTER_ALL,
      label: t('All Tags'),
      count: props.models.length,
    },
    ...props.tags.map((tag) => ({
      value: tag,
      label: tag,
      count: countBy(props.models, (model) =>
        parseTags(model.tags)
          .map((item) => item.toLowerCase())
          .includes(tag.toLowerCase())
      ),
    })),
  ]

  const endpointOptions: FilterOption[] = [
    {
      value: ENDPOINT_TYPES.ALL,
      label: endpointTypeLabels[ENDPOINT_TYPES.ALL],
      count: props.models.length,
    },
    ...Object.entries(endpointTypeLabels)
      .filter(([value]) => value !== ENDPOINT_TYPES.ALL)
      .map(([value, label]) => ({
        value,
        label,
        count: countBy(
          props.models,
          (model) => model.supported_endpoint_types?.includes(value) ?? false
        ),
      })),
  ]

  const items = [
    {
      key: 'groups',
      label: t('Groups'),
      children: (
        <FilterChips
          value={props.groupFilter}
          options={groupOptions}
          onChange={props.onGroupChange}
        />
      ),
    },
    {
      key: 'vendors',
      label: t('All Vendors'),
      children: (
        <FilterChips
          value={props.vendorFilter}
          options={vendorOptions}
          onChange={props.onVendorChange}
        />
      ),
    },
    {
      key: 'tags',
      label: t('Model Tags'),
      children: (
        <FilterChips
          value={props.tagFilter}
          options={tagOptions}
          onChange={props.onTagChange}
        />
      ),
    },
    {
      key: 'quota',
      label: t('Pricing Type'),
      children: (
        <FilterChips
          value={props.quotaTypeFilter}
          options={quotaOptions}
          onChange={props.onQuotaTypeChange}
        />
      ),
    },
    {
      key: 'endpoint',
      label: t('Endpoint Type'),
      children: (
        <FilterChips
          value={props.endpointTypeFilter}
          options={endpointOptions}
          onChange={props.onEndpointTypeChange}
        />
      ),
    },
  ]

  return (
    <aside
      className={cn(props.className)}
      style={{
        background: 'var(--pricing-panel)',
        border: '1px solid var(--pricing-border)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {t('Filter')}
          </Typography.Title>
          <Typography.Text type='secondary' style={{ fontSize: 12 }}>
            {t('Refine models by provider, group, type, and tags.')}
          </Typography.Text>
        </div>
        <Button
          type='text'
          size='small'
          icon={<ReloadOutlined />}
          onClick={props.onClearFilters}
          disabled={!props.hasActiveFilters}
        >
          {t('Reset')}
        </Button>
      </div>

      {props.hasActiveFilters && (
        <Tag color='default' style={{ marginBottom: 12 }}>
          {t('Filters active')}
        </Tag>
      )}

      <Collapse
        ghost
        defaultActiveKey={items.map((item) => item.key)}
        items={items}
        style={{ background: 'transparent' }}
      />
    </aside>
  )
}
