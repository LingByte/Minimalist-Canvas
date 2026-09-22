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
import { Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'

import { DEFAULT_PRICING_PAGE_SIZE, DEFAULT_TOKEN_UNIT } from '../constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import {
  formatPrice,
  formatRequestPrice,
  stripTrailingZeros,
} from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'

export interface PricingTableProps {
  models: PricingModel[]
  isLoading?: boolean
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  onModelClick?: (modelName: string) => void
}

export function PricingTable(props: PricingTableProps) {
  const { t } = useTranslation()
  const {
    models,
    isLoading = false,
    priceRate = 1,
    usdExchangeRate = 1,
    tokenUnit = DEFAULT_TOKEN_UNIT,
    showRechargePrice = false,
    selectedGroup,
    onModelClick,
  } = props

  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'

  const columns: ColumnsType<PricingModel> = useMemo(
    () => [
      {
        title: t('Model'),
        dataIndex: 'model_name',
        key: 'model_name',
        fixed: 'left',
        width: 220,
        render: (_value, model) => {
          const modelIconKey = model.icon || model.vendor_icon
          const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 14) : null
          return (
            <Space size={8}>
              {modelIcon}
              <Typography.Text
                strong
                ellipsis
                style={{ fontFamily: 'monospace', maxWidth: 180 }}
              >
                {model.model_name}
              </Typography.Text>
            </Space>
          )
        },
      },
      {
        title: t('Type'),
        key: 'quota_type',
        width: 120,
        render: (_value, model) => <ModelBillingModeBadge model={model} />,
      },
      {
        title: t('Price'),
        key: 'price',
        width: 180,
        render: (_value, model) => {
          const dynamicSummary = getDynamicPricingSummary(model, {
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            groupRatioMultiplier: getDynamicDisplayGroupRatio(
              model,
              selectedGroup
            ),
          })

          if (dynamicSummary) {
            if (dynamicSummary.isSpecialExpression) {
              return (
                <div>
                  <Typography.Text type='warning' style={{ fontSize: 12 }}>
                    {t('Special billing expression')}
                  </Typography.Text>
                </div>
              )
            }
            const primaryEntries = dynamicSummary.primaryEntries.slice(0, 2)
            if (primaryEntries.length === 0) {
              return (
                <Typography.Text type='secondary'>
                  {t('Dynamic Pricing')}
                </Typography.Text>
              )
            }
            return (
              <div>
                <Typography.Text style={{ fontFamily: 'monospace' }}>
                  {primaryEntries.map((entry, index) => (
                    <span key={entry.key}>
                      {index > 0 && (
                        <Typography.Text type='secondary'> / </Typography.Text>
                      )}
                      {stripTrailingZeros(entry.formatted)}
                    </span>
                  ))}
                </Typography.Text>
                <div>
                  <Typography.Text type='secondary' style={{ fontSize: 10 }}>
                    / {tokenUnitLabel} tokens
                  </Typography.Text>
                </div>
              </div>
            )
          }

          if (isTokenBasedModel(model)) {
            const inputPrice = stripTrailingZeros(
              formatPrice(
                model,
                'input',
                tokenUnit,
                showRechargePrice,
                priceRate,
                usdExchangeRate,
                selectedGroup
              )
            )
            const outputPrice = stripTrailingZeros(
              formatPrice(
                model,
                'output',
                tokenUnit,
                showRechargePrice,
                priceRate,
                usdExchangeRate,
                selectedGroup
              )
            )
            return (
              <div>
                <Typography.Text style={{ fontFamily: 'monospace' }}>
                  {inputPrice}
                  <Typography.Text type='secondary'> / </Typography.Text>
                  {outputPrice}
                </Typography.Text>
                <div>
                  <Typography.Text type='secondary' style={{ fontSize: 10 }}>
                    / {tokenUnitLabel} tokens
                  </Typography.Text>
                </div>
              </div>
            )
          }

          return (
            <div>
              <Typography.Text style={{ fontFamily: 'monospace' }}>
                {stripTrailingZeros(
                  formatRequestPrice(
                    model,
                    showRechargePrice,
                    priceRate,
                    usdExchangeRate,
                    selectedGroup
                  )
                )}
              </Typography.Text>
              <div>
                <Typography.Text type='secondary' style={{ fontSize: 10 }}>
                  / {t('request')}
                </Typography.Text>
              </div>
            </div>
          )
        },
      },
      {
        title: t('Cached'),
        key: 'cached_price',
        width: 110,
        render: (_value, model) => {
          if (!isTokenBasedModel(model) || model.cache_ratio == null) {
            return <Typography.Text type='secondary'>—</Typography.Text>
          }
          return (
            <Typography.Text style={{ fontFamily: 'monospace' }}>
              {stripTrailingZeros(
                formatPrice(
                  model,
                  'cache',
                  tokenUnit,
                  showRechargePrice,
                  priceRate,
                  usdExchangeRate,
                  selectedGroup
                )
              )}
            </Typography.Text>
          )
        },
      },
      {
        title: t('Vendor'),
        dataIndex: 'vendor_name',
        key: 'vendor_name',
        width: 130,
        render: (vendorName: string | undefined, model) => {
          if (!vendorName) {
            return <Typography.Text type='secondary'>—</Typography.Text>
          }
          const vendorIcon = model.vendor_icon
            ? getLobeIcon(model.vendor_icon, 12)
            : null
          return (
            <Space size={6}>
              {vendorIcon}
              <Tag>{vendorName}</Tag>
            </Space>
          )
        },
      },
      {
        title: t('Tags'),
        key: 'tags',
        width: 160,
        render: (_value, model) => {
          const tags = parseTags(model.tags)
          if (tags.length === 0) {
            return <Typography.Text type='secondary'>—</Typography.Text>
          }
          return (
            <Space size={[4, 4]} wrap>
              {tags.slice(0, 3).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Space>
          )
        },
      },
      {
        title: t('Endpoints'),
        key: 'supported_endpoint_types',
        width: 140,
        render: (_value, model) => {
          const endpoints = model.supported_endpoint_types || []
          if (endpoints.length === 0) {
            return <Typography.Text type='secondary'>—</Typography.Text>
          }
          return (
            <Space size={[4, 4]} wrap>
              {endpoints.slice(0, 3).map((ep) => (
                <Tag key={ep}>{ep}</Tag>
              ))}
            </Space>
          )
        },
      },
      {
        title: t('Groups'),
        key: 'enable_groups',
        width: 140,
        render: (_value, model) => {
          const groups = model.enable_groups || []
          if (groups.length === 0) {
            return <Typography.Text type='secondary'>—</Typography.Text>
          }
          return (
            <Space size={[4, 4]} wrap>
              {groups.slice(0, 3).map((group) => (
                <Tag key={group}>{group}</Tag>
              ))}
            </Space>
          )
        },
      },
    ],
    [
      priceRate,
      selectedGroup,
      showRechargePrice,
      t,
      tokenUnit,
      tokenUnitLabel,
      usdExchangeRate,
    ]
  )

  return (
    <Table<PricingModel>
      rowKey={(record) => String(record.id ?? record.model_name)}
      loading={isLoading}
      columns={columns}
      dataSource={models}
      pagination={{
        pageSize: DEFAULT_PRICING_PAGE_SIZE,
        showSizeChanger: false,
      }}
      scroll={{ x: 1100 }}
      onRow={(record) => ({
        onClick: () => onModelClick?.(record.model_name),
        style: { cursor: onModelClick ? 'pointer' : undefined },
      })}
      style={{
        background: 'var(--pricing-panel)',
        border: '1px solid var(--pricing-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
      locale={{
        emptyText: t('No models match your current filters.'),
      }}
    />
  )
}
