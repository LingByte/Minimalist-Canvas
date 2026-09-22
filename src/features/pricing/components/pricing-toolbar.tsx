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
import {
  AppstoreOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Badge, Button, Drawer, Dropdown, Segmented, Space, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  VIEW_MODES,
  getSortLabels,
  type SortOption,
  type ViewMode,
} from '../constants'
import type { PricingModel, PricingVendor, TokenUnit } from '../types'
import { PricingSidebar } from './pricing-sidebar'

export interface PricingToolbarProps {
  filteredCount: number
  totalCount?: number
  sortBy: string
  onSortChange: (value: string) => void
  tokenUnit: TokenUnit
  onTokenUnitChange: (value: TokenUnit) => void
  showRechargePrice: boolean
  onRechargePriceChange: (value: boolean) => void
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
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
  activeFilterCount: number
  onClearFilters: () => void
}

export function PricingToolbar(props: PricingToolbarProps) {
  const { t } = useTranslation()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const sortLabels = getSortLabels(t)

  const handleTokenUnitChange = useCallback(
    (value: string | number) => props.onTokenUnitChange(String(value) as TokenUnit),
    [props]
  )

  const handleViewModeChange = useCallback(
    (value: string | number) => props.onViewModeChange(String(value) as ViewMode),
    [props]
  )

  const handleRechargePriceChange = useCallback(
    (value: string | number) => props.onRechargePriceChange(String(value) === 'recharge'),
    [props]
  )

  return (
    <div className='border-border/70 bg-card/80 rounded-2xl border p-3 shadow-xs backdrop-blur-sm'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Space size={8} wrap>
          <Badge count={props.activeFilterCount} size='small' offset={[-4, 4]}>
            <Button
              className='xl:hidden'
              icon={<FilterOutlined />}
              onClick={() => setMobileFiltersOpen(true)}
            >
              {t('Filter')}
            </Button>
          </Badge>
          <Typography.Text>
            <Typography.Text strong>
              {props.filteredCount.toLocaleString()}
            </Typography.Text>{' '}
            <Typography.Text type='secondary'>
              {props.filteredCount === 1 ? t('model') : t('models')}
            </Typography.Text>
            {props.hasActiveFilters && props.totalCount ? (
              <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                {' '}
                / {props.totalCount.toLocaleString()}
              </Typography.Text>
            ) : null}
          </Typography.Text>
        </Space>

        <Space size={8} wrap>
          <Segmented
            className='hidden sm:inline-flex'
            value={props.showRechargePrice ? 'recharge' : 'standard'}
            onChange={handleRechargePriceChange}
            options={[
              { value: 'standard', label: t('Standard') },
              { value: 'recharge', label: t('Recharge') },
            ]}
          />
          <Segmented
            className='hidden sm:inline-flex'
            value={props.tokenUnit}
            onChange={handleTokenUnitChange}
            options={[
              { value: 'M', label: '/1M' },
              { value: 'K', label: '/1K' },
            ]}
          />
          <Dropdown
            menu={{
              items: Object.entries(sortLabels).map(([value, label]) => ({
                key: value,
                label,
                onClick: () => props.onSortChange(value),
              })),
              selectedKeys: [props.sortBy],
            }}
          >
            <Button icon={<SortAscendingOutlined />}>
              {sortLabels[props.sortBy as SortOption] || t('Sort')}
            </Button>
          </Dropdown>
          <Segmented
            value={props.viewMode}
            onChange={handleViewModeChange}
            options={[
              {
                value: VIEW_MODES.CARD,
                icon: <AppstoreOutlined />,
                title: t('Card view'),
              },
              {
                value: VIEW_MODES.TABLE,
                icon: <UnorderedListOutlined />,
                title: t('Table view'),
              },
            ]}
          />
        </Space>
      </div>

      <Drawer
        title={t('Filter')}
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        width={360}
        destroyOnHidden
      >
        <Typography.Paragraph type='secondary' style={{ marginTop: 0 }}>
          {t('Filter models by provider, group, type, endpoint, and tags.')}
        </Typography.Paragraph>
        <PricingSidebar
          quotaTypeFilter={props.quotaTypeFilter}
          endpointTypeFilter={props.endpointTypeFilter}
          vendorFilter={props.vendorFilter}
          groupFilter={props.groupFilter}
          tagFilter={props.tagFilter}
          onQuotaTypeChange={props.onQuotaTypeChange}
          onEndpointTypeChange={props.onEndpointTypeChange}
          onVendorChange={props.onVendorChange}
          onGroupChange={props.onGroupChange}
          onTagChange={props.onTagChange}
          vendors={props.vendors}
          groups={props.groups}
          groupRatios={props.groupRatios}
          tags={props.tags}
          models={props.models}
          hasActiveFilters={props.hasActiveFilters}
          onClearFilters={props.onClearFilters}
          className='border-0 bg-transparent p-0 shadow-none'
        />
      </Drawer>
    </div>
  )
}
