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
import { Link } from 'react-router-dom'
import { Empty, Skeleton } from 'antd'
import {
  ArrowRight,
  Clapperboard,
  ImageIcon,
  Play,
  Sparkles,
  Star,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { SmartImage } from '@/components/smart-image'
import {
  useActiveCampaignsQuery,
  useHomeCampaigns,
} from '@/features/campaigns/hooks'
import type { HomeCampaign } from '@/features/campaigns/types'
import {
  generationRecordUrl,
  listMyGenerationRecords,
  type GenerationRecord,
} from '@/features/generation-records/api'
import { cn } from '@/lib/utils'

type ShowcaseItem = {
  key: string
  title: string
  description: string
  image: string
  badge?: boolean
  linkProps: { to: string }
}

const HERO_AUTOPLAY_MS = 5000
const CREATOR_INCENTIVE_BANNER =
  '/images/promo/creator-incentive-banner.jpg?v=40'

const SHORT_DRAMA_FALLBACK: Omit<HomeCampaign, 'title' | 'description' | 'cta_text'> =
  {
    id: 'fallback',
    image_url:
      'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1400&q=80',
    poster: false,
    link: '/canvas?mode=new',
    enabled: true,
    start_at: '',
    end_at: '',
    sort: 0,
  }

function campaignSlugFromLink(link: string): string | null {
  const path = link.split(/[?#]/)[0]
  const match = path.match(/^\/campaigns\/([^/]+)/)
  if (match?.[1]) return match[1]
  if (path === '/creator-incentive') return 'creator-incentive'
  return null
}

function isLiveHomeCampaign(link: string, activeSlugs: Set<string>): boolean {
  const slug = campaignSlugFromLink(link)
  if (!slug) return true
  return activeSlugs.has(slug)
}

export function WorkspaceHome() {
  const { t } = useTranslation()
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(false)
  const homeCampaigns = useHomeCampaigns()
  const { data: campaigns = [], isPending: campaignsPending } =
    useActiveCampaignsQuery()
  const activeSlugs = new Set(campaigns.map((campaign) => campaign.slug))
  const liveHomeCampaigns = campaignsPending
    ? homeCampaigns
    : homeCampaigns.filter((campaign) =>
        isLiveHomeCampaign(campaign.link, activeSlugs)
      )

  const slides: HomeCampaign[] =
    liveHomeCampaigns.length > 0
      ? liveHomeCampaigns
      : [
          {
            ...SHORT_DRAMA_FALLBACK,
            title: t('Short drama creation'),
            description: t(
              'Storyboard, generate, and polish cinematic clips on one canvas.'
            ),
            cta_text: t('Start creating'),
          },
        ]
  const slideCount = slides.length
  const activeSlideIndex = heroIndex % slideCount
  const hero = slides[activeSlideIndex]
  const heroLinkProps = /^https?:\/\//.test(hero.link)
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}

  useEffect(() => {
    if (heroPaused || slideCount < 2) return
    const timer = window.setTimeout(() => {
      setHeroIndex((idx) => (idx + 1) % slideCount)
    }, HERO_AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [heroIndex, heroPaused, slideCount])

  const campaignCards: ShowcaseItem[] = campaigns.map((campaign) => ({
    key: `campaign-${campaign.id}`,
    title: campaign.title,
    description: campaign.summary,
    image: campaign.cover_url || '/images/home/campaign.jpg',
    badge: true,
    linkProps: {
      to: `/campaigns/${campaign.slug}`,
    },
  }))

  const showcase: ShowcaseItem[] = [
    ...campaignCards,
    {
      key: 'canvas',
      title: t('Creative canvas'),
      description: t('Infinite canvas for images, video, and workflows'),
      image: '/images/home/canvas.jpg',
      linkProps: { to: '/canvas' },
    },
    {
      key: 'prompts',
      title: t('Prompt library'),
      description: t('Battle-tested prompts for faster starts'),
      image: '/images/home/prompts.jpg',
      linkProps: { to: '/prompt-library' },
    },
    {
      key: 'records',
      title: t('Generation records'),
      description: t('Every image and video you have generated'),
      image: '/images/home/records.jpg',
      linkProps: { to: '/generation-logs' },
    },
    {
      key: 'circle',
      title: t('Creative Circle'),
      description: t('Share generations, collect inspiration, and remake with one click'),
      image: '/images/home/studio.jpg',
      linkProps: { to: '/creative-circle' },
    },
    {
      key: 'api',
      title: t('API access'),
      description: t('Integrate generation into your apps with our API docs'),
      image: '/images/home/api.svg',
      linkProps: { to: '/docs/quick-start' },
    },
  ]

  const creationsQuery = useQuery({
    queryKey: ['workspace-home', 'recent-creations'],
    queryFn: () => listMyGenerationRecords({ limit: 24, status: 'success' }),
    staleTime: 60_000,
  })

  const creations = (creationsQuery.data?.items ?? []).filter((item) =>
    Boolean(generationRecordUrl(item))
  )

  return (
    <Main className='bg-background overflow-y-auto'>
      <div className='mx-auto w-full max-w-[1400px] space-y-6 px-3 py-4 sm:px-5 sm:py-6 lg:px-6'>
        {/* Bento hero */}
        <section className='grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4'>
          <a
            href='/canvas'
            className='group relative col-span-1 min-h-[220px] overflow-hidden rounded-2xl lg:col-span-3 lg:min-h-[280px]'
          >
            <SmartImage
              src='/images/home/studio.jpg'
              alt=''
              className='absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]' />
            <div className='absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20' />
            <div className='relative flex h-full flex-col justify-between p-4 sm:p-5'>
              <div>
                <h2 className='text-lg font-semibold text-white'>
                  {t('Creative studio')}
                </h2>
                <p className='mt-1 text-xs text-white/70'>
                  {t('Open the creative workspace')}
                </p>
              </div>
              <div className='flex items-end justify-between gap-2'>
                <div className='flex -space-x-3'>
                  {[
                    '/images/home/image.jpg',
                    '/images/home/video.jpg',
                    '/images/home/canvas.jpg',
                  ].map((src) => (
                    <SmartImage
                      key={src}
                      src={src}
                      alt=''
                      className='size-12 rounded-lg border-2 border-black/40 object-cover shadow-lg sm:size-14' />
                  ))}
                </div>
                <span className='inline-flex size-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:translate-x-0.5'>
                  <ArrowRight className='size-5' />
                </span>
              </div>
            </div>
          </a>

          <div className='col-span-1 flex flex-col gap-3 lg:col-span-3'>
            <QuickActionCard
              href='/video'
              title={t('Video generation')}
              description={t('Turn ideas into motion')}
              image='/images/home/video.jpg'
              icon={<Clapperboard className='size-4' />}
            />
            <QuickActionCard
              href='/image'
              title={t('Image generation')}
              description={t('Create stills from prompts')}
              image='/images/home/image.jpg'
              icon={<ImageIcon className='size-4' />}
            />
          </div>

          <div
            className='group relative col-span-1 min-h-[220px] overflow-hidden rounded-2xl lg:col-span-6 lg:min-h-[280px]'
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
          >
            {hero.poster ? (
              <a
                href={hero.link}
                {...heroLinkProps}
                aria-label={hero.title}
                className='absolute inset-0'
              >
                <SmartImage
                  src={
                    hero.id === 'creator-incentive'
                      ? CREATOR_INCENTIVE_BANNER
                      : hero.image_url
                  }
                  alt={hero.title}
                  className='absolute inset-0 size-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]' />
              </a>
            ) : (
              <>
                <SmartImage
                  src={
                    hero.id === 'creator-incentive'
                      ? CREATOR_INCENTIVE_BANNER
                      : hero.image_url
                  }
                  alt=''
                  className='absolute inset-0 size-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]' />
                <div className='absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent' />
              </>
            )}
            <div className='pointer-events-none relative flex min-h-[220px] flex-col p-5 sm:p-6 lg:min-h-[280px]'>
              {hero.poster ? null : (
                <div className='pointer-events-auto max-w-md'>
                  <p className='text-xs font-medium tracking-wide text-white/60 uppercase'>
                    {t('Featured')}
                  </p>
                  <h2 className='mt-2 text-xl font-semibold text-white sm:text-2xl'>
                    {hero.title}
                  </h2>
                  {hero.description ? (
                    <p className='mt-2 text-sm text-white/75'>
                      {hero.description}
                    </p>
                  ) : null}
                  {hero.cta_text ? (
                    <a
                      href={hero.link}
                      {...heroLinkProps}
                      className='mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25'
                    >
                      {hero.cta_text}
                      <ArrowRight className='size-4' />
                    </a>
                  ) : null}
                </div>
              )}
              {slideCount > 1 ? (
                <div className='pointer-events-auto mt-auto flex gap-1.5 self-end pt-4'>
                  {slides.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type='button'
                      aria-label={slide.title}
                      onClick={() => setHeroIndex(idx)}
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        idx === activeSlideIndex
                          ? 'w-5 bg-white'
                          : 'w-1.5 bg-white/40 hover:bg-white/70'
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Featured showcase row */}
        <section className='space-y-3'>
          <div className='flex items-end justify-between gap-3'>
            <div>
              <h2 className='text-foreground text-base font-semibold tracking-tight'>
                {t('Recommended')}
              </h2>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {t('Popular tools and creation entry points')}
              </p>
            </div>
          </div>
          <div className='-mx-1 flex [scrollbar-width:none] gap-3 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden'>
            {showcase.map((item) => (
              <ShowcaseCard key={item.key} item={item} />
            ))}
          </div>
        </section>

        <section className='space-y-3 pb-8'>
          <div className='flex items-end justify-between gap-3'>
            <h2 className='text-foreground text-base font-semibold tracking-tight'>
              {t('My recent creations')}
            </h2>
            <Link
              to='/generation-logs'
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors'
            >
              {t('View all')}
              <ArrowRight className='size-3.5' />
            </Link>
          </div>
          <CreationFeed
            loading={creationsQuery.isLoading}
            creations={creations}
          />
        </section>
      </div>
    </Main>
  )
}

function QuickActionCard(props: {
  href: string
  title: string
  description: string
  image: string
  icon: ReactNode
}) {
  return (
    <a
      href={props.href}
      className='border-border/50 bg-card hover:border-border group flex min-h-[132px] flex-1 items-center justify-between gap-3 overflow-hidden rounded-2xl border p-3.5 transition-colors'
    >
      <div className='min-w-0'>
        <div className='text-foreground flex items-center gap-2 text-sm font-semibold'>
          <span className='bg-muted text-muted-foreground inline-flex size-7 items-center justify-center rounded-lg'>
            {props.icon}
          </span>
          {props.title}
        </div>
        <p className='text-muted-foreground mt-2 line-clamp-2 text-xs leading-relaxed'>
          {props.description}
        </p>
      </div>
      <div className='relative size-[72px] shrink-0 overflow-hidden rounded-xl'>
        <SmartImage
          src={props.image}
          alt=''
          className='size-full object-cover transition-transform duration-500 group-hover:scale-105' />
        <span className='absolute inset-0 flex items-center justify-center bg-black/25'>
          <Play className='size-5 fill-white text-white' />
        </span>
      </div>
    </a>
  )
}

function ShowcaseCard(props: { item: ShowcaseItem }) {
  const { t } = useTranslation()

  return (
    <Link
      {...props.item.linkProps}
      className='group relative flex aspect-[3/4] w-[148px] shrink-0 flex-col overflow-hidden rounded-2xl sm:w-[168px]'
    >
      <SmartImage
        src={props.item.image}
        alt=''
        className='absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]' />
      <div className='absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10' />
      {props.item.badge ? (
        <span className='absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white'>
          <Star className='size-3 fill-current' />
          {t('New')}
        </span>
      ) : null}
      <div className='relative mt-auto space-y-1 p-3'>
        <div className='truncate text-sm font-semibold text-white'>
          {props.item.title}
        </div>
        <div className='line-clamp-2 text-[11px] leading-snug text-white/70'>
          {props.item.description}
        </div>
      </div>
    </Link>
  )
}

function CreationFeed(props: {
  loading: boolean
  creations: GenerationRecord[]
}) {
  const { t } = useTranslation()

  if (props.loading) {
    return (
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {Array.from({ length: 8 }).map((_, idx) => (
          <Skeleton.Node
            key={idx}
            active
            style={{ width: '100%', height: 200 }}
          >
            <div />
          </Skeleton.Node>
        ))}
      </div>
    )
  }

  if (props.creations.length === 0) {
    return (
      <div className='border-border/50 bg-card/40 rounded-2xl border border-dashed px-4 py-16'>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('No creations yet')}
        />
        <div className='mt-4 flex justify-center'>
          <a
            href='/canvas?mode=new'
            className='bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium'
          >
            <Sparkles className='size-4' />
            {t('Start creating')}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
      {props.creations.map((record) => (
        <CreationCard key={record.id} record={record} />
      ))}
    </div>
  )
}

function CreationCard(props: { record: GenerationRecord }) {
  const { t } = useTranslation()
  const url = generationRecordUrl(props.record)
  const isVideo =
    props.record.kind === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url)
  const title =
    props.record.title?.trim() ||
    props.record.prompt?.trim().slice(0, 40) ||
    t('Untitled')

  return (
    <Link
      to='/generation-logs'
      className='border-border/40 bg-card group overflow-hidden rounded-2xl border transition-colors hover:border-white/20'
    >
      <div className='bg-muted relative aspect-[4/5] overflow-hidden'>
        {isVideo ? (
          <video
            src={url}
            muted
            playsInline
            preload='metadata'
            className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]'
          />
        ) : (
          <SmartImage
            src={url}
            alt=''
            className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]' />
        )}
        <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pt-10 pb-2.5'>
          <div className='truncate text-xs font-medium text-white'>{title}</div>
          <div className='mt-0.5 truncate text-[10px] text-white/65'>
            {props.record.kind === 'video'
              ? t('Video generation')
              : t('Image generation')}
          </div>
        </div>
      </div>
    </Link>
  )
}
