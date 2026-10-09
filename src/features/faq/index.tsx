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
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  HelpCircle,
  Search,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
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
function plainTextExcerpt(raw: string, max = 140) {
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

function FaqShell({ children }: { children: ReactNode }) {
  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition>
        <div className='faq-page bg-background min-h-[calc(100vh-3.5rem)]'>
          {children}
        </div>
      </PageTransition>
    </PublicLayout>
  )
}

function FaqPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className='mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-8 xl:px-10'>
      {children}
    </div>
  )
}

export function FaqPage() {
  const { t } = useTranslation()
  const { items, loading } = useFAQ()
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

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
    <FaqShell>
      <section className='border-border/60 border-b'>
        <FaqPageFrame>
          <div className='flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:py-8'>
            <div className='min-w-0'>
              <h1 className='flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl'>
                <HelpCircle className='text-muted-foreground size-4' />
                {t('FAQ')}
              </h1>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('Answers on access, billing, models, and workflows')}
              </p>
            </div>
            <div className='flex w-full items-center gap-2 sm:w-auto sm:min-w-[20rem] sm:max-w-md'>
              <Input
                allowClear
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search questions or answers')}
                prefix={<Search className='text-muted-foreground size-3.5' />}
                className='w-full'
              />
              {!loading ? (
                <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                  {formatNumber(filtered.length)}
                </span>
              ) : null}
            </div>
          </div>
        </FaqPageFrame>
      </section>

      <FaqPageFrame>
        <div className='grid gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[260px_minmax(0,1fr)] xl:py-10'>
          <aside className='hidden lg:block'>
            <div className='sticky top-24 space-y-6'>
              <div>
                <p className='text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.14em] uppercase'>
                  {t('FAQ')}
                </p>
                <p className='text-sm leading-6'>
                  {t(
                    'Browse detailed answers on access, billing, models, and canvas workflows. Search across questions and full answer text.'
                  )}
                </p>
              </div>
              <Link
                to='/docs'
                className='hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors'
              >
                <BookOpen className='text-muted-foreground size-4' />
                {t('View documentation')}
                <ArrowRight className='text-muted-foreground ml-auto size-3.5' />
              </Link>
            </div>
          </aside>

          <div className='min-w-0'>
            {loading ? (
              <div className='space-y-3'>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className='border-border/60 rounded-xl border px-4 py-4 sm:px-5'
                  >
                    <Skeleton
                      active
                      paragraph={false}
                      title={{ width: `${55 + (idx % 3) * 12}%` }}
                    />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className='flex min-h-[16rem] items-center justify-center rounded-xl border border-dashed px-4'>
                <Empty
                  description={
                    items.length === 0
                      ? t('No FAQ entries available')
                      : t('No matching FAQ entries')
                  }
                />
              </div>
            ) : (
              <ul className='border-border/60 divide-border/60 divide-y overflow-hidden rounded-xl border'>
                {filtered.map((item: FAQItem, idx: number) => {
                  const key = faqItemKey(item, idx)
                  const excerpt = plainTextExcerpt(item.answer)
                  const isOpen = openKey === key
                  return (
                    <li key={key}>
                      <button
                        type='button'
                        aria-expanded={isOpen}
                        onClick={() => setOpenKey(isOpen ? null : key)}
                        className='hover:bg-muted/30 flex w-full items-start gap-4 px-4 py-4 text-left transition-colors sm:px-6 sm:py-5'
                      >
                        <span className='text-muted-foreground/70 mt-0.5 w-7 shrink-0 font-mono text-xs tabular-nums'>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className='min-w-0 flex-1'>
                          <div className='text-foreground text-[15px] leading-snug font-medium sm:text-base'>
                            <RichContent breaks content={item.question} />
                          </div>
                          {!isOpen && excerpt ? (
                            <p className='text-muted-foreground mt-1.5 line-clamp-2 text-sm leading-6'>
                              {excerpt}
                            </p>
                          ) : null}
                        </div>
                        <ChevronDown
                          className={cn(
                            'text-muted-foreground mt-1 size-4 shrink-0 transition-transform',
                            isOpen && 'rotate-180'
                          )}
                        />
                      </button>
                      {isOpen ? (
                        <div className='border-border/50 bg-muted/15 border-t px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6'>
                          <div className='sm:pl-11'>
                            <div className='prose-faq text-[14.5px] leading-7'>
                              <RichContent
                                breaks
                                content={item.answer}
                                className='text-foreground/90 [&_a]:text-primary [&_img]:max-w-full [&_pre]:overflow-x-auto'
                              />
                            </div>
                            <Link
                              to={`/faq/${key}`}
                              className='text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium hover:underline'
                            >
                              {t('Read article')}
                              <ArrowRight className='size-3.5' />
                            </Link>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className='border-border/60 mt-10 flex flex-col gap-3 rounded-xl border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
              <div>
                <p className='text-sm font-medium'>{t('Still have questions?')}</p>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {t('Check the documentation for setup, models, and API usage.')}
                </p>
              </div>
              <Link
                to='/docs'
                className='bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors'
              >
                {t('View documentation')}
                <ArrowRight className='size-3.5' />
              </Link>
            </div>
          </div>
        </div>
      </FaqPageFrame>
    </FaqShell>
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
    ? items.findIndex(
        (entry) => entry === item || String(entry.id) === String(item.id)
      )
    : -1

  const related = useMemo(() => {
    if (!item) return []
    return items
      .map((entry, idx) => ({ entry, idx, key: faqItemKey(entry, idx) }))
      .filter(({ entry, key }) => entry !== item && key !== faqId)
      .slice(0, 8)
  }, [faqId, item, items])

  return (
    <FaqShell>
      <FaqPageFrame>
        <div className='py-8 sm:py-10'>
          <Link
            to='/faq'
            className='text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors'
          >
            <ArrowLeft className='size-3.5' />
            {t('Back to FAQ')}
          </Link>

          {loading ? (
            <div className='border-border/60 space-y-3 rounded-xl border px-5 py-6'>
              <Skeleton
                active
                paragraph={{ rows: 6 }}
                title={{ width: '70%' }}
              />
            </div>
          ) : !item ? (
            <div className='flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-12 text-center'>
              <Empty description={t('FAQ not found')} />
              <Link
                to='/faq'
                className='text-primary text-sm font-medium hover:underline'
              >
                {t('Back to FAQ')}
              </Link>
            </div>
          ) : (
            <div className='grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]'>
              <article className='min-w-0'>
                <header className='border-border/60 mb-6 border-b pb-5'>
                  {index >= 0 ? (
                    <p className='text-muted-foreground mb-2 font-mono text-[11px] tracking-wider uppercase'>
                      {t('Question {{number}}', {
                        number: String(index + 1).padStart(2, '0'),
                      })}
                    </p>
                  ) : null}
                  <h1 className='text-2xl leading-snug font-semibold tracking-tight sm:text-3xl'>
                    <RichContent breaks content={item.question} />
                  </h1>
                </header>
                <div className='prose-faq max-w-none text-[15px] leading-7'>
                  <RichContent
                    breaks
                    content={item.answer}
                    className='text-foreground/90 [&_a]:text-primary [&_img]:max-w-full [&_pre]:overflow-x-auto'
                  />
                </div>
              </article>

              <aside className='min-w-0'>
                <div className='lg:sticky lg:top-24'>
                  <p className='text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.14em] uppercase'>
                    {t('Related questions')}
                  </p>
                  {related.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('No FAQ entries available')}
                    </p>
                  ) : (
                    <ul className='border-border/60 divide-border/60 divide-y overflow-hidden rounded-xl border'>
                      {related.map(({ entry, key }) => (
                        <li key={key}>
                          <Link
                            to={`/faq/${key}`}
                            className='hover:bg-muted/40 block px-4 py-3 text-sm leading-6 transition-colors'
                          >
                            <RichContent breaks content={entry.question} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    to='/docs'
                    className='hover:bg-muted/50 mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors'
                  >
                    <BookOpen className='text-muted-foreground size-4' />
                    {t('View documentation')}
                    <ArrowRight className='text-muted-foreground ml-auto size-3.5' />
                  </Link>
                </div>
              </aside>
            </div>
          )}
        </div>
      </FaqPageFrame>
    </FaqShell>
  )
}
