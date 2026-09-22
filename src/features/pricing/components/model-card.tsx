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
import { CopyOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Card, Space, Typography } from 'antd'
import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getLobeIcon } from '@/lib/lobe-icon'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, formatRequestPrice } from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'

export interface ModelCardProps {
  model: PricingModel
  onClick: () => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  perf?: ModelPerfBadgeData
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1
  const showRechargePrice = props.showRechargePrice ?? false
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const tags = parseTags(props.model.tags)
  const groups = props.model.enable_groups || []
  const endpoints = props.model.supported_endpoint_types || []
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const initial = props.model.model_name?.charAt(0).toUpperCase() || '?'
  const isDynamicPricing =
    props.model.billing_mode === 'tiered_expr' &&
    Boolean(props.model.billing_expr)
  const hasCachedPrice = isTokenBased && props.model.cache_ratio != null
  const dynamicSummary = isDynamicPricing
    ? getDynamicPricingSummary(props.model, {
        tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(
          props.model,
          props.selectedGroup
        ),
      })
    : null

  const primaryGroup = groups[0]
  const bottomTags = [...endpoints.slice(0, 2), ...tags.slice(0, 2)]
  const hiddenCount =
    Math.max(groups.length - 1, 0) +
    Math.max(endpoints.length - 2, 0) +
    Math.max(tags.length - 2, 0)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(props.model.model_name || '')
  }

  let priceSummary: ReactNode
  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      priceSummary = (
        <span>
          <Typography.Text type='warning'>
            {t('Special billing expression')}
          </Typography.Text>
          <Typography.Text
            type='secondary'
            code
            style={{ display: 'block', fontSize: 11 }}
            ellipsis
          >
            {dynamicSummary.rawExpression}
          </Typography.Text>
        </span>
      )
    } else if (dynamicSummary.primaryEntries.length > 0) {
      priceSummary = (
        <>
          {dynamicSummary.primaryEntries.map((entry) => (
            <Typography.Text key={entry.key} type='secondary'>
              {t(entry.shortLabel)}{' '}
              <Typography.Text strong style={{ fontFamily: 'monospace' }}>
                {entry.formatted}
              </Typography.Text>
            </Typography.Text>
          ))}
        </>
      )
    } else {
      priceSummary = (
        <Typography.Text type='secondary'>{t('Dynamic Pricing')}</Typography.Text>
      )
    }
  } else if (isTokenBased) {
    priceSummary = (
      <>
        <Typography.Text type='secondary'>
          {t('Input')}{' '}
          <Typography.Text strong style={{ fontFamily: 'monospace' }}>
            {formatPrice(
              props.model,
              'input',
              tokenUnit,
              showRechargePrice,
              priceRate,
              usdExchangeRate,
              props.selectedGroup
            )}
          </Typography.Text>
        </Typography.Text>
        <Typography.Text type='secondary'>
          {t('Output')}{' '}
          <Typography.Text strong style={{ fontFamily: 'monospace' }}>
            {formatPrice(
              props.model,
              'output',
              tokenUnit,
              showRechargePrice,
              priceRate,
              usdExchangeRate,
              props.selectedGroup
            )}
          </Typography.Text>
        </Typography.Text>
        {hasCachedPrice && (
          <Typography.Text type='secondary'>
            {t('Cached')}{' '}
            <Typography.Text strong style={{ fontFamily: 'monospace' }}>
              {formatPrice(
                props.model,
                'cache',
                tokenUnit,
                showRechargePrice,
                priceRate,
                usdExchangeRate,
                props.selectedGroup
              )}
            </Typography.Text>
          </Typography.Text>
        )}
      </>
    )
  } else {
    priceSummary = (
      <Typography.Text type='secondary'>
        <Typography.Text strong style={{ fontFamily: 'monospace' }}>
          {formatRequestPrice(
            props.model,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
        </Typography.Text>{' '}
        / {t('request')}
      </Typography.Text>
    )
  }

  return (
    <Card
      hoverable
      styles={{
        body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
      }}
      style={{
        background: 'var(--pricing-panel)',
        borderColor: 'var(--pricing-border)',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--pricing-fill)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {modelIcon || (
              <Typography.Text strong type='secondary'>
                {initial}
              </Typography.Text>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <Typography.Title
              level={5}
              ellipsis
              style={{ margin: 0, fontFamily: 'monospace' }}
            >
              {props.model.model_name}
            </Typography.Title>
            <Space size={[12, 4]} wrap style={{ marginTop: 4 }}>
              {priceSummary}
            </Space>
          </div>
        </div>
        <Space size={4}>
          <Button size='small' onClick={props.onClick}>
            {t('Details')} <RightOutlined />
          </Button>
          <Button
            size='small'
            icon={<CopyOutlined />}
            onClick={handleCopy}
            title={t('Copy')}
          />
        </Space>
      </div>

      <Typography.Paragraph
        type='secondary'
        ellipsis={{ rows: 2 }}
        style={{ marginBottom: 0, minHeight: 40 }}
      >
        {props.model.description || t('No description available.')}
      </Typography.Paragraph>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) auto',
          gap: 8,
          alignItems: 'start',
        }}
      >
        <Space size={8} wrap>
          {primaryGroup && (
            <Typography.Text type='secondary'>{primaryGroup}</Typography.Text>
          )}
          <ModelBillingModeBadge model={props.model} />
        </Space>
        <ModelPerfBadge perf={props.perf} />
        <Space size={8} wrap>
          {bottomTags.map((item) => (
            <Typography.Text key={item} type='secondary' style={{ fontSize: 12 }}>
              {item}
            </Typography.Text>
          ))}
          <Typography.Text type='secondary' style={{ fontSize: 12 }}>
            {tokenUnitLabel}
          </Typography.Text>
          {hiddenCount > 0 && (
            <Typography.Text type='secondary' style={{ fontSize: 12 }}>
              +{hiddenCount}
            </Typography.Text>
          )}
        </Space>
      </div>
    </Card>
  )
})
