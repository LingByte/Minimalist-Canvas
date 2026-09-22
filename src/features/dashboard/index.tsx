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
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, Skeleton, Tabs, Tooltip } from 'antd'

import { SectionPageLayout } from '@/components/layout'
import { FadeIn } from '@/components/page-transition'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { ModelsChartPreferences } from './components/models/models-chart-preferences'
import { ModelsFilter } from './components/models/models-filter-dialog'
import { OverviewDashboard } from './components/overview/overview-dashboard'
import { DEFAULT_TIME_GRANULARITY } from './constants'
import {
  buildDefaultDashboardFilters,
  getDefaultDays,
  getSavedChartPreferences,
  getSavedGranularity,
  saveChartPreferences,
} from './lib'
import {
  type DashboardSectionId,
  DASHBOARD_DEFAULT_SECTION,
  DASHBOARD_SECTION_IDS,
} from './section-registry'
import type {
  DashboardChartPreferences,
  DashboardFilters,
  QuotaDataItem,
  UserChartsFilters,
} from './types'

const LOG_STAT_CARD_FALLBACK_KEYS = [
  'count',
  'quota',
  'tokens',
  'average-rpm',
  'average-tpm',
] as const
const PERFORMANCE_METRIC_FALLBACK_KEYS = [
  'success-rate',
  'average-latency',
  'throughput',
] as const
const PERFORMANCE_MODEL_FALLBACK_KEYS = [
  'primary-model',
  'secondary-model',
] as const

const LazyLogStatCards = lazy(() =>
  import('./components/models/log-stat-cards').then((m) => ({
    default: m.LogStatCards,
  }))
)

const LazyModelCharts = lazy(() =>
  import('./components/models/model-charts').then((m) => ({
    default: m.ModelCharts,
  }))
)

const LazyConsumptionDistributionChart = lazy(() =>
  import('./components/models/consumption-distribution-chart').then((m) => ({
    default: m.ConsumptionDistributionChart,
  }))
)

const LazyPerformanceOverview = lazy(() =>
  import('./components/models/performance-overview').then((m) => ({
    default: m.PerformanceOverview,
  }))
)

const LazyUserCharts = lazy(() =>
  import('./components/users/user-charts').then((m) => ({
    default: m.UserCharts,
  }))
)

const LazyFlowCharts = lazy(() =>
  import('./components/flow/flow-charts').then((m) => ({
    default: m.FlowCharts,
  }))
)

function LogStatCardsFallback() {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='divide-border/60 grid grid-cols-2 divide-x sm:grid-cols-3 lg:grid-cols-5'>
        {LOG_STAT_CARD_FALLBACK_KEYS.map((key, index) => (
          <div
            key={key}
            className={cn(
              'px-2.5 py-1.5 sm:px-5 sm:py-4',
              index === LOG_STAT_CARD_FALLBACK_KEYS.length - 1 &&
                'col-span-2 sm:col-span-1'
            )}
          >
            <div className='flex items-center gap-1.5 sm:gap-2'>
              <Skeleton.Avatar
                active
                size='small'
                shape='square'
                className='!size-4 sm:!size-7'
              />
              <Skeleton.Input
                active
                size='small'
                style={{ width: 64, minWidth: 64, height: 16 }}
              />
            </div>
            <Skeleton.Input
              active
              size='small'
              className='mt-1 sm:mt-2'
              style={{ width: 64, minWidth: 64, height: 20 }}
            />
            <Skeleton.Input
              active
              size='small'
              className='mt-1 hidden md:block'
              style={{ width: 112, minWidth: 112, height: 14 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ModelChartsFallback() {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex items-center justify-between border-b px-4 py-3 sm:px-5'>
        <Skeleton.Input
          active
          size='small'
          style={{ width: 128, minWidth: 128, height: 20 }}
        />
        <Skeleton.Input
          active
          style={{ width: 288, minWidth: 288, height: 32 }}
        />
      </div>
      <div className='h-96 p-2'>
        <Skeleton.Node active className='!h-full !w-full'>
          <div className='h-full w-full' />
        </Skeleton.Node>
      </div>
    </div>
  )
}

function PerformanceOverviewFallback() {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-5'>
        <div className='flex items-center gap-2'>
          <Skeleton.Input
            active
            size='small'
            style={{ width: 96, minWidth: 96, height: 16 }}
          />
        </div>
        {PERFORMANCE_METRIC_FALLBACK_KEYS.map((key) => (
          <div key={key} className='flex items-center gap-1.5'>
            <Skeleton.Input
              active
              size='small'
              style={{ width: 56, minWidth: 56, height: 12 }}
            />
            <Skeleton.Input
              active
              size='small'
              style={{ width: 64, minWidth: 64, height: 16 }}
            />
          </div>
        ))}
        <div className='ml-auto flex items-center gap-2'>
          {PERFORMANCE_MODEL_FALLBACK_KEYS.map((key) => (
            <Skeleton.Input
              key={key}
              active
              size='small'
              style={{ width: 112, minWidth: 112, height: 20, borderRadius: 999 }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const SECTION_META: Record<DashboardSectionId, { titleKey: string }> = {
  overview: {
    titleKey: 'Overview',
  },
  models: {
    titleKey: 'Model Call Analytics',
  },
  flow: {
    titleKey: 'Flow',
  },
  users: {
    titleKey: 'User Analytics',
  },
}

export function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const activeSection = (params.section ??
    DASHBOARD_DEFAULT_SECTION) as DashboardSectionId

  const [modelData, setModelData] = useState<QuotaDataItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [chartPreferences, setChartPreferences] =
    useState<DashboardChartPreferences>(() => getSavedChartPreferences())
  const [modelFilters, setModelFilters] = useState<DashboardFilters>(() =>
    buildDefaultDashboardFilters(getSavedChartPreferences())
  )
  const [userChartsFilters, setUserChartsFilters] = useState<UserChartsFilters>(
    () => {
      const granularity = getSavedGranularity()
      return {
        timeGranularity: granularity,
        selectedRange: getDefaultDays(granularity),
        topUserLimit: 10,
      }
    }
  )
  const [flowSensitiveVisible, setFlowSensitiveVisible] = useState(true)

  const handleFilterChange = useCallback((filters: DashboardFilters) => {
    setModelFilters(filters)
  }, [])

  const handleResetFilters = useCallback(() => {
    setModelFilters(buildDefaultDashboardFilters(chartPreferences))
  }, [chartPreferences])

  const handleDataUpdate = useCallback(
    (data: QuotaDataItem[], loading: boolean) => {
      setModelData(data)
      setDataLoading(loading)
    },
    []
  )

  const handleChartPreferencesChange = useCallback(
    (preferences: DashboardChartPreferences) => {
      setChartPreferences(preferences)
      setModelFilters(buildDefaultDashboardFilters(preferences))
      saveChartPreferences(preferences)
    },
    []
  )

  const meta = SECTION_META[activeSection] ?? SECTION_META.overview
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const visibleSections = useMemo(
    () =>
      DASHBOARD_SECTION_IDS.filter(
        (section) => section !== 'overview' && (section !== 'users' || isAdmin)
      ),
    [isAdmin]
  )
  const handleSectionChange = useCallback(
    (section: string) => {
      void navigate(`/dashboard/${section}`)
    },
    [navigate]
  )
  const showSectionTabs =
    activeSection !== 'overview' && visibleSections.length > 1
  const modelActions =
    activeSection === 'models' ? (
      <>
        <ModelsChartPreferences
          preferences={chartPreferences}
          onPreferencesChange={handleChartPreferencesChange}
        />
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
        />
      </>
    ) : null
  const flowActions =
    activeSection === 'flow' ? (
      <>
        <Tooltip
          title={
            flowSensitiveVisible
              ? t('Hide sensitive data')
              : t('Show sensitive data')
          }
        >
          <Button
            type='text'
            icon={flowSensitiveVisible ? <Eye /> : <EyeOff />}
            onClick={() => setFlowSensitiveVisible((prev) => !prev)}
            aria-label={
              flowSensitiveVisible
                ? t('Hide sensitive data')
                : t('Show sensitive data')
            }
            className='text-muted-foreground hover:text-foreground size-8'
          />
        </Tooltip>
        <ModelsFilter
          preferences={chartPreferences}
          currentFilters={modelFilters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          titleKey='Flow Filters'
          descriptionKey='Filter the traffic flow view by time range and user.'
        />
      </>
    ) : null
  const sectionActions = modelActions ?? flowActions

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t(meta.titleKey)}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-3 sm:space-y-4'>
          {activeSection !== 'overview' && (
            <div className='flex flex-wrap items-center justify-between gap-1.5 sm:gap-2'>
              {showSectionTabs ? (
                <Tabs
                  activeKey={activeSection}
                  onChange={handleSectionChange}
                  items={visibleSections.map((section) => ({
                    key: section,
                    label: t(SECTION_META[section].titleKey),
                  }))}
                  className='max-w-full [&_.ant-tabs-nav]:mb-0'
                />
              ) : (
                <div />
              )}
              {sectionActions != null && (
                <div className='flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2'>
                  {sectionActions}
                </div>
              )}
            </div>
          )}
          {activeSection === 'overview' && <OverviewDashboard />}
          {activeSection === 'models' && (
            <>
              <FadeIn>
                <Suspense fallback={<LogStatCardsFallback />}>
                  <LazyLogStatCards
                    filters={modelFilters}
                    onDataUpdate={handleDataUpdate}
                  />
                </Suspense>
              </FadeIn>
              {isAdmin && (
                <FadeIn delay={0.05}>
                  <Suspense fallback={<PerformanceOverviewFallback />}>
                    <LazyPerformanceOverview />
                  </Suspense>
                </FadeIn>
              )}
              <FadeIn delay={0.1}>
                <Suspense fallback={<ModelChartsFallback />}>
                  <LazyConsumptionDistributionChart
                    data={modelData}
                    loading={dataLoading}
                    defaultChartType={
                      chartPreferences.consumptionDistributionChart
                    }
                    timeGranularity={
                      modelFilters.time_granularity || DEFAULT_TIME_GRANULARITY
                    }
                  />
                </Suspense>
              </FadeIn>
              <FadeIn delay={0.15}>
                <Suspense fallback={<ModelChartsFallback />}>
                  <LazyModelCharts
                    data={modelData}
                    loading={dataLoading}
                    defaultChartTab={chartPreferences.modelAnalyticsChart}
                    timeGranularity={
                      modelFilters.time_granularity || DEFAULT_TIME_GRANULARITY
                    }
                  />
                </Suspense>
              </FadeIn>
            </>
          )}
          {activeSection === 'users' && (
            <FadeIn>
              <Suspense fallback={<ModelChartsFallback />}>
                <LazyUserCharts
                  filters={userChartsFilters}
                  onFiltersChange={setUserChartsFilters}
                />
              </Suspense>
            </FadeIn>
          )}
          {activeSection === 'flow' && (
            <FadeIn>
              <Suspense fallback={<ModelChartsFallback />}>
                <LazyFlowCharts
                  filters={modelFilters}
                  sensitiveVisible={flowSensitiveVisible}
                />
              </Suspense>
            </FadeIn>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
