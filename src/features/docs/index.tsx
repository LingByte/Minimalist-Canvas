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
import { CheckOutlined, CopyOutlined, DownloadOutlined, MenuOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button, Drawer } from 'antd'
import { ArrowLeft, ArrowRight, Bug } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { saveBlobAs } from '@canvas/lib/save-file'
import { cn } from '@/lib/utils'

import { DocsApiDebugDrawer } from './components/docs-api-debug-drawer'
import { DocsCodeSamples } from './components/docs-code-samples'
import { DocsMarkdown } from './components/docs-markdown'
import { DocsNav } from './components/docs-nav'
import { DocsStatusCodes } from './components/docs-status-codes'
import { HttpMethodBadge } from './components/http-method-badge'
import { getDocsContent, resolveDocsLocale } from './lib/content'
import {
  prepareDocsMarkdown,
  type DocsEndpoint,
} from './lib/parse-markdown'
import { resolveApiBase } from './lib/resolve-api-base'
import {
  getAdjacentDocsSections,
  getDocsSection,
  type DocsSectionId,
} from './lib/sections'
import {
  getDocsVideoModels,
  renderDocsVideoModels,
  type DocsVideoModelsState,
} from './lib/video-models'

type DocsPageProps = {
  section: DocsSectionId
}

function DocsPageInner(props: DocsPageProps) {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [debugEndpoint, setDebugEndpoint] = useState<DocsEndpoint | null>(null)
  const [sampleEndpoint, setSampleEndpoint] = useState<DocsEndpoint | null>(
    null
  )
  const locale = resolveDocsLocale(i18n.language)
  const baseUrl = resolveApiBase()
  const activeSection = getDocsSection(props.section)
  const adjacent = getAdjacentDocsSections(props.section)

  useEffect(() => {
    setSampleEndpoint(null)
    setDebugEndpoint(null)
    setCopied(false)
  }, [props.section])

  const videoModelsQuery = useQuery({
    queryKey: ['docs', 'video-models'],
    queryFn: getDocsVideoModels,
    enabled: props.section === 'video',
    staleTime: 60_000,
    retry: false,
  })
  const videoModels = videoModelsQuery.data
  const videoModelsFailed = videoModelsQuery.isError

  const prepared = useMemo(() => {
    let videoModelsState: DocsVideoModelsState = { status: 'loading' }
    if (videoModels) {
      videoModelsState = { status: 'ready', groups: videoModels }
    } else if (videoModelsFailed) {
      videoModelsState = { status: 'error' }
    } else if (props.section !== 'video') {
      videoModelsState = { status: 'ready', groups: [] }
    }
    const raw = renderDocsVideoModels(
      getDocsContent(props.section, locale),
      videoModelsState,
      {
        loading: t('docs.videoModels.loading'),
        unavailable: t('docs.videoModels.unavailable'),
        empty: t('docs.videoModels.empty'),
        separator: t('docs.videoModels.separator'),
      }
    )
    return prepareDocsMarkdown(raw, baseUrl)
  }, [baseUrl, locale, props.section, t, videoModels, videoModelsFailed])

  const primaryEndpoint =
    sampleEndpoint &&
    prepared.endpoints.some(
      (endpoint) =>
        endpoint.method === sampleEndpoint.method &&
        endpoint.path === sampleEndpoint.path
    )
      ? sampleEndpoint
      : (prepared.endpoints[0] ?? null)
  const showStatusCodes =
    prepared.endpoints.length > 0 || props.section === 'errors'

  const tocHeadings = useMemo(() => {
    const extra: { id: string; text: string; level: 2 | 3 }[] = []
    if (primaryEndpoint) {
      extra.push({
        id: 'code-samples',
        text: t('docs.codeSamples.title'),
        level: 2,
      })
    }
    if (showStatusCodes) {
      extra.push({
        id: 'responses',
        text: t('docs.status.title'),
        level: 2,
      })
    }
    return [...extra, ...prepared.headings]
  }, [primaryEndpoint, prepared.headings, showStatusCodes, t])

  const handleCopyBase = async () => {
    const ok = await copyToClipboard(baseUrl)
    if (!ok) return
    setCopied(true)
    toast.success(t('docs.copied'))
    window.setTimeout(() => setCopied(false), 1600)
  }

  const handleDownloadMarkdown = async () => {
    const blob = new Blob([prepared.rawMarkdown], {
      type: 'text/markdown;charset=utf-8',
    })
    await saveBlobAs(blob, `${props.section}.md`)
    toast.success(t('docs.downloaded'))
  }

  return (
    <div className='docs-shell bg-background relative min-h-[calc(100svh-3.5rem)]'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_70%_55%_at_8%_-10%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_70%),radial-gradient(ellipse_50%_40%_at_92%_0%,color-mix(in_oklch,var(--muted)_80%,transparent),transparent_65%)]'
      />

      <div className='relative flex min-h-[calc(100svh-3.5rem)]'>
        <aside className='border-border/40 bg-muted/15 sticky top-14 hidden h-[calc(100svh-3.5rem)] w-[16.5rem] shrink-0 border-r backdrop-blur-sm lg:block'>
          <DocsNav activeId={props.section} />
        </aside>

        <div className='min-w-0 flex-1'>
          <div className='border-border/40 bg-background/90 sticky top-14 z-10 border-b backdrop-blur-md lg:hidden'>
            <div className='flex items-center gap-2 px-4 py-2.5'>
              <Button
                size='small'
                icon={<MenuOutlined />}
                onClick={() => setNavOpen(true)}
              >
                {t('docs.menu')}
              </Button>
              <span className='text-muted-foreground min-w-0 truncate text-sm'>
                {activeSection ? t(activeSection.titleKey) : t('docs.title')}
              </span>
            </div>
          </div>

          <Drawer
            title={t('docs.title')}
            placement='left'
            open={navOpen}
            onClose={() => setNavOpen(false)}
            width={300}
            styles={{ body: { padding: 0 } }}
          >
            <DocsNav
              activeId={props.section}
              onNavigate={() => setNavOpen(false)}
            />
          </Drawer>

          <DocsApiDebugDrawer
            open={Boolean(debugEndpoint)}
            endpoint={debugEndpoint}
            markdown={prepared.body}
            onClose={() => setDebugEndpoint(null)}
          />

          <div className='mx-auto flex w-full max-w-6xl gap-8 px-4 py-7 sm:px-6 lg:gap-10 lg:px-8 lg:py-9'>
            <article className='min-w-0 flex-1'>
              {activeSection ? (
                <header className='docs-page-hero mb-7'>
                  <p className='text-muted-foreground mb-2 text-[11px] font-medium tracking-[0.14em] uppercase'>
                    {t('docs.title')}
                    <span className='text-border mx-2'>/</span>
                    {t(
                      activeSection.group === 'guides'
                        ? 'docs.groups.guides'
                        : 'docs.groups.reference'
                    )}
                  </p>
                  <h1 className='text-foreground max-w-3xl text-[1.65rem] leading-[1.15] font-semibold tracking-tight sm:text-[1.9rem]'>
                    {t(activeSection.titleKey)}
                  </h1>
                  <p className='text-muted-foreground mt-2 max-w-2xl text-[14px] leading-relaxed'>
                    {t(activeSection.descriptionKey)}
                  </p>
                  <div className='mt-5 flex flex-wrap gap-2'>
                    <button
                      type='button'
                      onClick={() => void handleCopyBase()}
                      className='border-border hover:bg-muted/50 inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm transition-colors'
                    >
                      {copied ? (
                        <CheckOutlined className='text-xs' />
                      ) : (
                        <CopyOutlined className='text-xs' />
                      )}
                      <span className='text-muted-foreground text-[10px] font-medium tracking-wide uppercase'>
                        {t('docs.apiBase')}
                      </span>
                      <code className='font-mono text-xs'>{baseUrl}</code>
                    </button>
                    <button
                      type='button'
                      onClick={handleDownloadMarkdown}
                      className='border-border hover:bg-muted/50 inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm transition-colors'
                    >
                      <DownloadOutlined className='text-xs' />
                      {t('docs.downloadMarkdown')}
                    </button>
                  </div>
                </header>
              ) : null}

              {prepared.endpoints.length > 0 ? (
                <div className='mb-8 space-y-2'>
                  {prepared.endpoints.map((endpoint) => (
                    <div
                      key={`${endpoint.method}-${endpoint.path}`}
                      className='border-border/70 bg-muted/20 flex items-center gap-3 overflow-x-auto rounded-lg border px-3 py-2.5'
                    >
                      <HttpMethodBadge
                        method={endpoint.method}
                        className='h-6 min-w-12 text-[11px]'
                      />
                      <code className='min-w-0 flex-1 font-mono text-[13px] whitespace-nowrap'>
                        {endpoint.path}
                      </code>
                      <Button
                        size='small'
                        type='primary'
                        ghost
                        className='shrink-0'
                        icon={<Bug className='size-3.5' />}
                        onClick={() => setDebugEndpoint(endpoint)}
                      >
                        {t('docs.debug.button')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {primaryEndpoint ? (
                <div id='code-samples' className='scroll-mt-24'>
                  {prepared.endpoints.length > 1 ? (
                    <div className='mb-3 flex flex-wrap gap-2'>
                      {prepared.endpoints.map((endpoint) => {
                        const active =
                          endpoint.method === primaryEndpoint.method &&
                          endpoint.path === primaryEndpoint.path
                        return (
                          <Button
                            key={`${endpoint.method}-${endpoint.path}`}
                            size='small'
                            type={active ? 'primary' : 'default'}
                            ghost={!active}
                            onClick={() => setSampleEndpoint(endpoint)}
                          >
                            <span className='font-mono text-[11px]'>
                              {endpoint.method.toUpperCase()}
                            </span>
                          </Button>
                        )
                      })}
                    </div>
                  ) : null}
                  <DocsCodeSamples
                    key={`${primaryEndpoint.method}:${primaryEndpoint.path}`}
                    endpoint={primaryEndpoint}
                    markdown={prepared.body}
                  />
                </div>
              ) : null}

              {showStatusCodes ? <DocsStatusCodes /> : null}

              <DocsMarkdown
                content={prepared.body}
                headings={prepared.headings}
              />

              <nav className='border-border/70 mt-14 grid gap-3 border-t pt-8 sm:grid-cols-2'>
                {adjacent.prev ? (
                  <Link
                    to={`/docs/${adjacent.prev.id}`}
                    className='border-border/70 hover:bg-muted/40 group flex flex-col gap-1 rounded-lg border px-4 py-3.5 transition-colors'
                  >
                    <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                      <ArrowLeft className='size-3.5 transition-transform group-hover:-translate-x-0.5' />
                      {t('docs.prev')}
                    </span>
                    <span className='text-sm font-medium'>
                      {t(adjacent.prev.titleKey)}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {adjacent.next ? (
                  <Link
                    to={`/docs/${adjacent.next.id}`}
                    className='border-border/70 hover:bg-muted/40 group flex flex-col items-end gap-1 rounded-lg border px-4 py-3.5 text-right transition-colors'
                  >
                    <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                      {t('docs.next')}
                      <ArrowRight className='size-3.5 transition-transform group-hover:translate-x-0.5' />
                    </span>
                    <span className='text-sm font-medium'>
                      {t(adjacent.next.titleKey)}
                    </span>
                  </Link>
                ) : null}
              </nav>
            </article>

            <DocsToc headings={tocHeadings} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function DocsPage(props: DocsPageProps) {
  return (
    <PublicLayout showMainContainer={false}>
      <DocsPageInner key={props.section} {...props} />
    </PublicLayout>
  )
}

function DocsToc(props: {
  headings: { id: string; text: string; level: 2 | 3 }[]
}) {
  const { t } = useTranslation()
  if (props.headings.length === 0) return null

  return (
    <aside className='hidden w-56 shrink-0 xl:block'>
      <div className='sticky top-24'>
        <p className='text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.1em] uppercase'>
          {t('docs.onThisPage')}
        </p>
        <ul className='border-border/60 max-h-[calc(100svh-8rem)] space-y-0.5 overflow-y-auto border-l'>
          {props.headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={cn(
                  'text-muted-foreground hover:text-foreground hover:border-foreground/40 block border-l-2 border-transparent py-1.5 text-[13px] leading-snug transition-colors',
                  heading.level === 2 ? '-ml-px pl-3' : '-ml-px pl-5'
                )}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
