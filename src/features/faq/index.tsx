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
import { Link } from 'react-router-dom'
import { Empty, Input, Skeleton } from 'antd'
import { ArrowRight, ArrowLeft, HelpCircle, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { RichContent } from '@/components/rich-content'
import { useFAQ } from '@/features/dashboard/hooks/use-status-data'
import type { FAQItem } from '@/features/dashboard/types'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function faqItemKey(item: FAQItem, idx: number) {
  return String(item.id ?? `faq-${idx}`)
}

/** Readable preview text: drop images, URLs, and file names from FAQ answers. */
function plainTextExcerpt(raw: string, max = 120) {
  let text = String(raw || '')
  text = text.replace(/<img\b[^>]*>/gi, ' ')
  text = text.replace(/<\/?(?:video|audio|source|iframe)\b[^>]*>/gi, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
  text = text.replace(/https?:\/\/[^\s)<\]"']+/gi, ' ')
  text = text.replace(
    /\b[\w%+=.-]{8,}\.(?:png|jpe?g|gif|webp|svg|bmp|mp4|webm|mov|m4v|pdf)\b/gi,
    ' '
  )
  text = text.replace(/[#>*_`~|\\]+/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function FaqPage() {
  const { t } = useTranslation()
  const { items, loading } = useFAQ()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return items
    return items.filter((item) => {
      const question = String(item.question || '').toLowerCase()
      const answer = String(item.answer || '').toLowerCase()
      return question.includes(keyword) || answer.includes(keyword)
    })
  }, [items, query])

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition>
        <div className='faq-page relative min-h-[calc(100vh-3.5rem)] overflow-hidden'>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(var(--primary)/0.08),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgb(var(--chart-2)/0.06),transparent_50%)]'
          />
          <div
            aria-hidden
            className='pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:48px_48px]'
          />

          <div className='relative mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12 lg:px-8'>
            <header className='mb-6 space-y-3 sm:mb-8 sm:space-y-4'>
              <div className='text-primary inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] uppercase'>
                <HelpCircle className='size-3.5' />
                {t('FAQ')}
              </div>
              <h1 className='max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl [font-family:var(--font-serif)]'>
                {t('Frequently asked questions')}
              </h1>
              <p className='text-muted-foreground max-w-3xl text-sm leading-6 sm:text-base sm:leading-7'>
                {t(
                  'Browse detailed answers on access, billing, models, and canvas workflows. Search across questions and full answer text.'
                )}
              </p>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <Input
                  allowClear
                  size='large'
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('Search questions or answers')}
                  prefix={<Search className='text-muted-foreground size-4' />}
                  className='w-full sm:max-w-md'
                />
                {!loading ? (
                  <p className='text-muted-foreground text-sm tabular-nums'>
                    {t('{{count}} questions', {
                      count: formatNumber(filtered.length),
                    })}
                    {items.length !== filtered.length
                      ? ` · ${t('{{count}} total', { count: formatNumber(items.length) })}`
                      : null}
                  </p>
                ) : null}
              </div>
            </header>

            {loading ? (
              <div className='space-y-3'>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className='rounded-xl border border-black/5 bg-white/60 px-5 py-5 dark:border-white/10 dark:bg-white/5'
                  >
                    <Skeleton active paragraph={{ rows: 1 }} title={{ width: '65%' }} />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className='flex min-h-[22rem] items-center justify-center rounded-2xl border border-dashed px-6 py-16'>
                <Empty
                  description={
                    items.length === 0
                      ? t('No FAQ entries available')
                      : t('No matching FAQ entries')
                  }
                />
              </div>
            ) : (
              <ol className='divide-border/70 border-border/70 divide-y overflow-hidden rounded-2xl border bg-background/80 shadow-[0_1px_0_rgb(0_0_0/0.03)] backdrop-blur-sm'>
                {filtered.map((item: FAQItem, idx: number) => {
                  const key = faqItemKey(item, idx)
                  const excerpt = plainTextExcerpt(item.answer)
                  return (
                    <li key={key}>
                      <Link
                        to={`/faq/${key}`}
                        className={cn(
                          'group flex items-start gap-4 px-5 py-5 transition-colors sm:gap-5 sm:px-6 sm:py-6',
                          'hover:bg-primary/[0.03] focus-visible:bg-primary/[0.04] focus-visible:outline-none'
                        )}
                      >
                        <span className='text-muted-foreground/70 mt-0.5 w-8 shrink-0 font-mono text-sm tabular-nums'>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className='min-w-0 flex-1 space-y-2'>
                          <div className='text-foreground text-[15px] leading-snug font-semibold sm:text-base'>
                            <RichContent breaks content={item.question} />
                          </div>
                          {excerpt ? (
                            <p className='text-muted-foreground line-clamp-2 text-sm leading-6'>
                              {excerpt}
                            </p>
                          ) : null}
                          <span className='text-primary inline-flex items-center gap-1 text-sm font-medium'>
                            {t('View details')}
                            <ArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
                          </span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </PageTransition>
    </PublicLayout>
  )
}

export function FaqDetailPage({ faqId }: { faqId: string }) {
  const { t } = useTranslation()
  const { items, loading } = useFAQ()

  const item = useMemo(() => {
    const byId = items.find((entry) => String(entry.id) === faqId)
    if (byId) return byId
    const idx = Number(faqId.replace(/^faq-/, ''))
    if (Number.isFinite(idx) && items[idx]) return items[idx]
    return null
  }, [faqId, items])

  const index = item
    ? items.findIndex((entry) => entry === item || String(entry.id) === String(item.id))
    : -1

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition>
        <div className='faq-page relative min-h-[calc(100vh-3.5rem)] overflow-hidden'>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(var(--primary)/0.08),transparent_55%)]'
          />
          <div className='relative mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12 lg:px-8'>
            <Link
              to='/faq'
              className='text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-2 text-sm transition-colors'
            >
              <ArrowLeft className='size-4' />
              {t('Back to FAQ')}
            </Link>

            {loading ? (
              <div className='space-y-4 rounded-2xl border px-6 py-8'>
                <Skeleton active paragraph={{ rows: 6 }} title={{ width: '80%' }} />
              </div>
            ) : !item ? (
              <div className='flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center'>
                <Empty description={t('FAQ not found')} />
                <Link to='/faq' className='text-primary text-sm font-medium hover:underline'>
                  {t('Back to FAQ')}
                </Link>
              </div>
            ) : (
              <article className='space-y-8'>
                <header className='space-y-4 border-b pb-8'>
                  {index >= 0 ? (
                    <p className='text-muted-foreground font-mono text-xs tracking-wider uppercase'>
                      {t('Question {{number}}', { number: String(index + 1).padStart(2, '0') })}
                    </p>
                  ) : null}
                  <h1 className='text-3xl leading-tight font-semibold tracking-tight sm:text-4xl [font-family:var(--font-serif)]'>
                    <RichContent breaks content={item.question} />
                  </h1>
                </header>
                <div className='prose-faq text-[15px] leading-8 sm:text-base'>
                  <RichContent
                    breaks
                    content={item.answer}
                    className='text-foreground/90 [&_a]:text-primary [&_img]:max-w-full [&_pre]:overflow-x-auto'
                  />
                </div>
              </article>
            )}
          </div>
        </div>
      </PageTransition>
    </PublicLayout>
  )
}
