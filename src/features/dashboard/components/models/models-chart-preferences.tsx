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
import { Save, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Select } from 'antd'

import {
  CONSUMPTION_DISTRIBUTION_CHART_OPTIONS,
  MODEL_ANALYTICS_CHART_OPTIONS,
  TIME_GRANULARITY_OPTIONS,
  TIME_RANGE_PRESETS,
} from '@/features/dashboard/constants'
import type {
  ConsumptionDistributionChartType,
  DashboardChartPreferences,
  ModelAnalyticsChartTab,
} from '@/features/dashboard/types'
import type { TimeGranularity } from '@/lib/time'

interface ModelsChartPreferencesProps {
  preferences: DashboardChartPreferences
  onPreferencesChange: (preferences: DashboardChartPreferences) => void
}

export function ModelsChartPreferences(props: ModelsChartPreferencesProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DashboardChartPreferences>(
    props.preferences
  )

  const handleOpen = () => {
    setDraft(props.preferences)
    setOpen(true)
  }

  const handleSave = () => {
    props.onPreferencesChange(draft)
    setOpen(false)
  }

  return (
    <>
      <Button size='small' onClick={handleOpen}>
        <Settings2 className='mr-2 h-4 w-4' />
        {t('Preferences')}
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={t('Model Analytics Defaults')}
        width={448}
        footer={
          <Button type='primary' onClick={handleSave}>
            <Save className='mr-2 h-4 w-4' />
            {t('Save Preferences')}
          </Button>
        }
      >
        <p className='text-muted-foreground mb-4 text-sm'>
          {t('Set default ranges and charts for model analytics.')}
        </p>
        <div className='grid gap-3'>
          <div className='grid gap-1.5'>
            <label className='text-sm font-medium' htmlFor='default-time-range'>
              {t('Default range')}
            </label>
            <Select
              id='default-time-range'
              className='w-full'
              placeholder={t('Select default range')}
              value={String(draft.defaultTimeRangeDays)}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  defaultTimeRangeDays: Number(value),
                }))
              }
              options={TIME_RANGE_PRESETS.map((option) => ({
                value: String(option.days),
                label: t(option.label),
              }))}
            />
          </div>
          <div className='grid gap-1.5'>
            <label
              className='text-sm font-medium'
              htmlFor='default-time-granularity'
            >
              {t('Default time granularity')}
            </label>
            <Select
              id='default-time-granularity'
              className='w-full'
              placeholder={t('Select time granularity')}
              value={draft.defaultTimeGranularity}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  defaultTimeGranularity: value as TimeGranularity,
                }))
              }
              options={TIME_GRANULARITY_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.label),
              }))}
            />
          </div>
          <div className='grid gap-1.5'>
            <label
              className='text-sm font-medium'
              htmlFor='consumption-distribution-chart'
            >
              {t('Default consumption chart')}
            </label>
            <Select
              id='consumption-distribution-chart'
              className='w-full'
              placeholder={t('Select default chart')}
              value={draft.consumptionDistributionChart}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  consumptionDistributionChart:
                    value as ConsumptionDistributionChartType,
                }))
              }
              options={CONSUMPTION_DISTRIBUTION_CHART_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
            />
          </div>
          <div className='grid gap-1.5'>
            <label
              className='text-sm font-medium'
              htmlFor='model-analytics-chart'
            >
              {t('Default model call chart')}
            </label>
            <Select
              id='model-analytics-chart'
              className='w-full'
              placeholder={t('Select default chart')}
              value={draft.modelAnalyticsChart}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  modelAnalyticsChart: value as ModelAnalyticsChartTab,
                }))
              }
              options={MODEL_ANALYTICS_CHART_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
