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
import { useQuery } from '@tanstack/react-query'
import { Dropdown, Segmented } from 'antd'
import { ArrowDownWideNarrow, AudioLines, Boxes } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'

import { getVoiceCatalog } from './api'
import {
  EmptyState,
  LoadingSkeleton,
  ModelDetailsDrawer,
  SearchBar,
  VoiceCardGrid,
} from './components'
import { PricingAntProvider } from './components/pricing-ant-provider'
import { SelectionFilterRail } from './components/selection-filter-rail'
import { SelectionModelList } from './components/selection-model-list'
import { SelectionPreviewPane } from './components/selection-preview-pane'
import {
  EXCLUDED_GROUPS,
  VIEW_MODES,
  getSortLabels,
  type SortOption,
} from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'

export function Pricing() {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [plazaTab, setPlazaTab] = useState<'models' | 'voices'>('models')
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )
  const [detailsOpen, setDetailsOpen] = useState(false)

  const { data: voiceCatalog, isLoading: voicesLoading } = useQuery({
    queryKey: ['voice-catalog'],
    queryFn: getVoiceCatalog,
  })
  const voices = voiceCatalog?.data?.items ?? []

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    tokenUnit,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const sortLabels = getSortLabels(t)

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  useEffect(() => {
    if (filteredModels.length === 0) {
      setSelectedModelName(null)
      setDetailsOpen(false)
      return
    }
    const stillVisible = filteredModels.some(
      (model) => model.model_name === selectedModelName
    )
    if (!stillVisible) {
      setSelectedModelName(filteredModels[0]?.model_name ?? null)
      setDetailsOpen(false)
    }
  }, [filteredModels, selectedModelName])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? filteredModels.find((m) => m.model_name === selectedModelName) ||
          null
        : null,
    [filteredModels, selectedModelName]
  )

  const catalogCount =
    plazaTab === 'voices' ? voices.length : models?.length || 0

  const shell = (content: ReactNode) => (
    <PublicLayout showMainContainer={false}>
      <PricingAntProvider>
        <PageTransition className='relative min-h-[calc(100dvh-3.5rem)]'>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-0 overflow-hidden'
          >
            <div className='bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] absolute inset-x-0 top-0 h-[28rem] from-stone-400/15 via-transparent to-transparent dark:from-stone-500/10' />
            <div
              className='absolute inset-0 opacity-[0.035] dark:opacity-[0.06]'
              style={{
                backgroundImage:
                  'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
          </div>
          {content}
        </PageTransition>
      </PricingAntProvider>
    </PublicLayout>
  )

  if (isLoading) {
    return shell(
      <div className='relative mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1680px] flex-col px-3 py-3 sm:px-4'>
        <LoadingSkeleton viewMode={VIEW_MODES.TABLE} />
      </div>
    )
  }

  return shell(
    <div className='relative mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-[1680px] flex-col gap-2 px-3 py-2.5 sm:px-4 sm:py-3'>
      <header className='flex shrink-0 flex-wrap items-center gap-2'>
        <div className='mr-1 flex min-w-0 items-baseline gap-2'>
          <h1 className='truncate text-base font-semibold tracking-tight sm:text-lg [font-family:var(--font-serif)]'>
            {t('Model Selection')}
          </h1>
          <span className='text-muted-foreground hidden font-mono text-[11px] tabular-nums sm:inline'>
            {catalogCount.toLocaleString()}{' '}
            {plazaTab === 'voices' ? t('voices') : t('models')}
          </span>
        </div>

        <Segmented
          size='small'
          value={plazaTab}
          onChange={(value) => {
            if (value === 'models' || value === 'voices') {
              setPlazaTab(value)
            }
          }}
          options={[
            {
              label: (
                <span className='inline-flex items-center gap-1'>
                  <Boxes className='size-3.5' />
                  {t('Models')}
                </span>
              ),
              value: 'models',
            },
            {
              label: (
                <span className='inline-flex items-center gap-1'>
                  <AudioLines className='size-3.5' />
                  {t('Voices')}
                </span>
              ),
              value: 'voices',
            },
          ]}
        />

        {plazaTab === 'models' ? (
          <>
            <SearchBar
              size='middle'
              value={searchInput}
              onChange={setSearchInput}
              onClear={clearSearch}
              placeholder={t(
                'Search model name, provider, endpoint, or tag...'
              )}
              className='min-w-[12rem] flex-1 [&_.ant-input-affix-wrapper]:rounded-lg'
            />
            <div className='ml-auto flex flex-wrap items-center gap-1.5'>
              <Segmented
                size='small'
                value={showRechargePrice ? 'recharge' : 'standard'}
                onChange={(value) =>
                  setShowRechargePrice(String(value) === 'recharge')
                }
                options={[
                  { value: 'standard', label: t('Standard') },
                  { value: 'recharge', label: t('Recharge') },
                ]}
              />
              <Segmented
                size='small'
                value={tokenUnit}
                onChange={(value) => setTokenUnit(String(value) as 'M' | 'K')}
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
                    onClick: () => setSortBy(value),
                  })),
                  selectedKeys: [sortBy],
                }}
              >
                <button
                  type='button'
                  className='border-border/80 bg-card/80 inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs'
                >
                  <ArrowDownWideNarrow className='size-3.5' />
                  {sortLabels[sortBy as SortOption] || t('Sort')}
                </button>
              </Dropdown>
            </div>
          </>
        ) : null}
      </header>

      {plazaTab === 'voices' ? (
        <main className='hover-scrollbar min-h-0 flex-1 overflow-y-auto'>
          {voicesLoading ? (
            <LoadingSkeleton viewMode={VIEW_MODES.CARD} />
          ) : (
            <VoiceCardGrid voices={voices} />
          )}
        </main>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col gap-2'>
          <SelectionFilterRail
            models={models || []}
            vendors={vendors || []}
            groups={availableGroups}
            tags={availableTags}
            vendorFilter={vendorFilter}
            groupFilter={groupFilter}
            quotaTypeFilter={quotaTypeFilter}
            endpointTypeFilter={endpointTypeFilter}
            tagFilter={tagFilter}
            onVendorChange={setVendorFilter}
            onGroupChange={setGroupFilter}
            onQuotaTypeChange={setQuotaTypeFilter}
            onEndpointTypeChange={setEndpointTypeFilter}
            onTagChange={setTagFilter}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />

          {filteredModels.length === 0 ? (
            <EmptyState
              searchQuery={searchInput}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={handleClearAll}
            />
          ) : (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'border-border/70 bg-card/75 grid min-h-0 flex-1 overflow-hidden rounded-xl border shadow-sm backdrop-blur-sm',
                'lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]'
              )}
            >
              <section className='border-border/70 flex min-h-[16rem] flex-col border-b lg:min-h-0 lg:border-r lg:border-b-0'>
                <div className='border-border/70 flex items-center justify-between gap-2 border-b px-3 py-1.5'>
                  <span className='text-muted-foreground text-[10px] font-semibold tracking-[0.16em] uppercase'>
                    {t('Index')}
                  </span>
                  <span className='font-mono text-[11px] tabular-nums'>
                    {filteredModels.length.toLocaleString()}
                    {hasActiveFilters && models?.length
                      ? ` / ${models.length.toLocaleString()}`
                      : ''}
                  </span>
                </div>
                <div className='min-h-0 flex-1'>
                  <SelectionModelList
                    models={filteredModels}
                    selectedModelName={selectedModelName}
                    onSelect={setSelectedModelName}
                    tokenUnit={tokenUnit}
                    showRechargePrice={showRechargePrice}
                    priceRate={priceRate}
                    usdExchangeRate={usdExchangeRate}
                    selectedGroup={groupFilter}
                  />
                </div>
              </section>

              <section className='bg-background/40 min-h-[18rem] lg:min-h-0'>
                <SelectionPreviewPane
                  model={selectedModel}
                  groupRatio={groupRatio || {}}
                  usableGroup={usableGroup || {}}
                  endpointMap={
                    (endpointMap as Record<
                      string,
                      { path?: string; method?: string }
                    >) || {}
                  }
                  autoGroups={autoGroups || []}
                  priceRate={priceRate ?? 1}
                  usdExchangeRate={usdExchangeRate ?? 1}
                  tokenUnit={tokenUnit}
                  showRechargePrice={showRechargePrice}
                  onOpenDetails={() => setDetailsOpen(true)}
                />
              </section>
            </motion.div>
          )}

          {selectedModel ? (
            <ModelDetailsDrawer
              open={detailsOpen}
              onOpenChange={setDetailsOpen}
              model={selectedModel}
              groupRatio={groupRatio || {}}
              usableGroup={usableGroup || {}}
              endpointMap={
                (endpointMap as Record<
                  string,
                  { path?: string; method?: string }
                >) || {}
              }
              autoGroups={autoGroups || []}
              priceRate={priceRate ?? 1}
              usdExchangeRate={usdExchangeRate ?? 1}
              tokenUnit={tokenUnit}
              showRechargePrice={showRechargePrice}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
