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
import { Link } from 'react-router-dom'
import { Button, Drawer } from 'antd'
import { ArrowLeft, ArrowRight, Bug } from 'lucide-react'
import { useMemo, useState } from 'react'
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

  const prepared = useMemo(() => {
    const raw = getDocsContent(props.section, locale)
    return prepareDocsMarkdown(raw, baseUrl)
  }, [baseUrl, locale, props.section])

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
    <div>
      <div className='flex min-h-[calc(100svh-3.5rem)]'>
        <aside className='border-border/60 bg-background sticky top-14 hidden h-[calc(100svh-3.5rem)] w-[17.5rem] shrink-0 border-r lg:block'>
          <DocsNav activeId={props.section} />
        </aside>

        <div className='min-w-0 flex-1'>
          <div className='border-border/70 bg-background/80 sticky top-14 z-10 border-b backdrop-blur-sm lg:hidden'>
            <div className='flex items-center gap-2 px-4 py-2'>
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
            width={288}
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

          <div className='mx-auto flex w-full max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:gap-12 lg:px-10 lg:py-12'>
            <article className='min-w-0 flex-1'>
              <p className='text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.14em] uppercase'>
                {t('docs.title')}
                {activeSection ? (
                  <>
                    <span className='text-border mx-1.5'>/</span>
                    {t(
                      activeSection.group === 'guides'
                        ? 'docs.groups.guides'
                        : 'docs.groups.reference'
                    )}
                  </>
                ) : null}
              </p>

              {activeSection ? (
                <header className='border-border/60 mb-10 border-b pb-8'>
                  <h1 className='text-foreground text-3xl font-semibold tracking-tight sm:text-[2rem]'>
                    {t(activeSection.titleKey)}
                  </h1>
                  <p className='text-muted-foreground mt-3 max-w-2xl text-[15px] leading-7'>
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
