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
import { CheckOutlined, CopyOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Drawer, Input, Switch, Tooltip } from 'antd'
import {
  Bug,
  Clock3,
  Eraser,
  Play,
  Shield,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

import {
  buildCurlCommand,
  buildDefaultHeaders,
  defaultBodyForPath,
  extractCurlJsonBody,
  formatJsonMaybe,
  methodAllowsBody,
  readStoredApiKey,
  statusTone,
  writeStoredApiKey,
  type DocsDebugHeader,
} from '../lib/docs-api-debug'
import type { DocsEndpoint } from '../lib/parse-markdown'
import { HttpMethodBadge } from './http-method-badge'

type DocsApiDebugDrawerProps = {
  open: boolean
  endpoint: DocsEndpoint | null
  markdown: string
  onClose: () => void
}

type DebugResponse = {
  status: number
  statusText: string
  durationMs: number
  headers: { key: string; value: string }[]
  body: string
  ok: boolean
}

const STATUS_TONE_CLASS = {
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
  neutral: 'bg-muted text-muted-foreground',
} as const

/** High-contrast dark console fields (stay on-theme, readable text). */
const darkFieldClassName = cn(
  '!h-9 !rounded-lg !border-zinc-700 !bg-zinc-900 !font-mono !text-xs !text-zinc-100',
  'placeholder:!text-zinc-500 hover:!border-zinc-500 focus-within:!border-emerald-500/70',
  '[&_input]:!bg-transparent [&_input]:!text-zinc-100 [&_input]:!font-mono [&_input]:!text-xs',
  '[&_.ant-input-password-icon]:!text-zinc-400 hover:[&_.ant-input-password-icon]:!text-zinc-200'
)

const darkTextAreaClassName = cn(
  '!rounded-xl !border-zinc-700 !bg-zinc-900 !font-mono !text-[12px] !leading-5 !text-zinc-100',
  'placeholder:!text-zinc-500 hover:!border-zinc-500 focus:!border-emerald-500/70'
)

function createInitialState(endpoint: DocsEndpoint, markdown: string) {
  const method = endpoint.method.toUpperCase()
  const url = endpoint.path
  const apiKey = readStoredApiKey()
  const sample = extractCurlJsonBody(markdown) || defaultBodyForPath(url)
  return {
    method,
    url,
    apiKey,
    headers: buildDefaultHeaders({ path: url, method, apiKey }),
    body: methodAllowsBody(method) ? sample : '',
  }
}

export function DocsApiDebugDrawer(props: DocsApiDebugDrawerProps) {
  if (!props.endpoint) return null

  return (
    <DocsApiDebugDrawerSession
      key={`${props.endpoint.method}:${props.endpoint.path}`}
      open={props.open}
      endpoint={props.endpoint}
      markdown={props.markdown}
      onClose={props.onClose}
    />
  )
}

function DocsApiDebugDrawerSession(props: {
  open: boolean
  endpoint: DocsEndpoint
  markdown: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const initial = createInitialState(props.endpoint, props.markdown)
  const [url, setUrl] = useState(initial.url)
  const [method] = useState(initial.method)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [headers, setHeaders] = useState<DocsDebugHeader[]>(initial.headers)
  const [body, setBody] = useState(initial.body)
  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<DebugResponse | null>(null)
  const [error, setError] = useState('')
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)
  const [showResponseHeaders, setShowResponseHeaders] = useState(false)

  const curl = useMemo(
    () =>
      buildCurlCommand({
        method,
        url: url.trim() || props.endpoint.path,
        headers,
        body,
      }),
    [body, headers, method, props.endpoint.path, url]
  )

  const syncAuthIntoHeaders = (nextKey: string) => {
    setHeaders((prev) =>
      prev.map((header) => {
        const key = header.key.trim().toLowerCase()
        if (key === 'authorization') {
          return {
            ...header,
            value: nextKey ? `Bearer ${nextKey}` : 'Bearer YOUR_API_KEY',
          }
        }
        if (key === 'x-api-key') {
          return {
            ...header,
            value: nextKey || 'YOUR_API_KEY',
          }
        }
        return header
      })
    )
  }

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    writeStoredApiKey(value)
    syncAuthIntoHeaders(value)
  }

  const updateHeader = (
    id: string,
    patch: Partial<Pick<DocsDebugHeader, 'key' | 'value' | 'enabled'>>
  ) => {
    setHeaders((prev) =>
      prev.map((header) => (header.id === id ? { ...header, ...patch } : header))
    )
  }

  const addHeader = () => {
    setHeaders((prev) => [
      ...prev,
      {
        id: `h-${Date.now()}`,
        key: '',
        value: '',
        enabled: true,
      },
    ])
  }

  const removeHeader = (id: string) => {
    setHeaders((prev) => prev.filter((header) => header.id !== id))
  }

  const handleSend = async () => {
    if (!url.trim()) {
      toast.error(t('docs.debug.urlRequired'))
      return
    }

    setSending(true)
    setError('')
    setResponse(null)

    const requestHeaders = new Headers()
    for (const header of headers) {
      if (!header.enabled || !header.key.trim()) continue
      requestHeaders.set(header.key.trim(), header.value)
    }

    const started = performance.now()
    try {
      const init: RequestInit = {
        method: method.toUpperCase(),
        headers: requestHeaders,
      }
      if (methodAllowsBody(method) && body.trim()) {
        init.body = body
      }

      const result = await fetch(url.trim(), init)
      const durationMs = Math.round(performance.now() - started)
      const text = await result.text()
      const responseHeaders: { key: string; value: string }[] = []
      result.headers.forEach((value, key) => {
        responseHeaders.push({ key, value })
      })

      setResponse({
        status: result.status,
        statusText: result.statusText,
        durationMs,
        headers: responseHeaders,
        body: formatJsonMaybe(text),
        ok: result.ok,
      })
    } catch (err) {
      const durationMs = Math.round(performance.now() - started)
      setError(
        err instanceof Error ? err.message : t('docs.debug.requestFailed')
      )
      setResponse({
        status: 0,
        statusText: 'Network Error',
        durationMs,
        headers: [],
        body: '',
        ok: false,
      })
    } finally {
      setSending(false)
    }
  }

  const handleCopyCurl = async () => {
    if (!curl.trim()) {
      toast.error(t('docs.debug.urlRequired'))
      return
    }
    const ok = await copyToClipboard(curl)
    if (!ok) return
    setCopiedCurl(true)
    toast.success(t('docs.copied'))
    window.setTimeout(() => setCopiedCurl(false), 1600)
  }

  const handleCopyResponse = async () => {
    if (!response?.body) return
    const ok = await copyToClipboard(response.body)
    if (!ok) return
    setCopiedBody(true)
    toast.success(t('docs.copied'))
    window.setTimeout(() => setCopiedBody(false), 1600)
  }

  const tone = response ? statusTone(response.status || 500) : 'neutral'
  const drawerWidth =
    typeof window !== 'undefined' ? Math.min(720, window.innerWidth) : 720

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      placement='right'
      width={drawerWidth}
      destroyOnHidden
      closable={false}
      title={null}
      footer={null}
      classNames={{
        content: 'flex h-full flex-col overflow-hidden',
        body: 'flex h-full min-h-0 flex-col overflow-hidden !p-0',
      }}
      styles={{
        body: {
          padding: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        content: { display: 'flex', flexDirection: 'column', height: '100%' },
      }}
    >
      <div className='bg-background flex h-full min-h-0 flex-col overflow-hidden'>
        <header className='border-border/70 shrink-0 border-b px-4 py-3 sm:px-5'>
          <div className='flex items-start gap-3'>
            <Button
              type='text'
              size='small'
              className='mt-0.5 shrink-0'
              icon={<X className='size-4' />}
              onClick={props.onClose}
              aria-label={t('docs.debug.close')}
            />
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex size-8 shrink-0 items-center justify-center rounded-lg'>
                  <Bug className='size-4' />
                </span>
                <h2 className='text-base font-semibold tracking-tight'>
                  {t('docs.debug.title')}
                </h2>
                <HttpMethodBadge
                  method={props.endpoint.method}
                  className='h-6 min-w-12 text-[11px]'
                />
              </div>
              <p className='text-muted-foreground mt-1.5 text-xs leading-5'>
                {t('docs.debug.subtitle')}
              </p>
            </div>
          </div>
        </header>

        <div
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5'
          data-docs-debug-scroll
        >
          <div className='flex flex-col gap-4 pb-2'>
            <section className='rounded-2xl border border-emerald-500/20 bg-zinc-950 text-zinc-100 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.55)]'>
              <div className='flex items-center justify-between border-b border-white/10 px-4 py-2.5'>
                <div className='flex items-center gap-2 text-[11px] font-medium tracking-[0.14em] text-zinc-400 uppercase'>
                  <Terminal className='size-3.5 text-emerald-400' />
                  {t('docs.debug.request')}
                </div>
                <Tooltip title={t('docs.debug.copyCurl')}>
                  <Button
                    size='small'
                    type='text'
                    className='!text-zinc-300 hover:!bg-white/8 hover:!text-white'
                    icon={copiedCurl ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() => void handleCopyCurl()}
                  >
                    cURL
                  </Button>
                </Tooltip>
              </div>

              <div className='space-y-3 p-4'>
                <div className='flex gap-2'>
                  <div className='flex h-9 w-[88px] shrink-0 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-900 font-mono text-xs font-semibold tracking-wide text-sky-300'>
                    {method}
                  </div>
                  <Input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    className={darkFieldClassName}
                    placeholder='https://…'
                  />
                </div>

                <div className='rounded-xl border border-zinc-700 bg-zinc-900/80 p-3'>
                  <div className='mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-zinc-300 uppercase'>
                    <Shield className='size-3.5 text-sky-300' />
                    {t('docs.debug.apiKey')}
                  </div>
                  <Input.Password
                    value={apiKey}
                    onChange={(event) => handleApiKeyChange(event.target.value)}
                    placeholder={t('docs.debug.apiKeyPlaceholder')}
                    className={darkFieldClassName}
                    visibilityToggle
                  />
                  <p className='mt-2 text-[11px] leading-4 text-zinc-400'>
                    {t('docs.debug.apiKeyHint')}
                  </p>
                </div>

                <div>
                  <div className='mb-2 flex items-center justify-between'>
                    <span className='text-[11px] font-medium tracking-[0.12em] text-zinc-300 uppercase'>
                      {t('docs.debug.headers')}
                    </span>
                    <Button
                      size='small'
                      type='text'
                      className='!text-emerald-300 hover:!bg-white/8'
                      icon={<PlusOutlined />}
                      onClick={addHeader}
                    >
                      {t('docs.debug.addHeader')}
                    </Button>
                  </div>
                  <div className='max-h-52 space-y-2 overflow-y-auto pr-1'>
                    {headers.map((header) => (
                      <div
                        key={header.id}
                        className='grid grid-cols-[28px_minmax(0,0.9fr)_minmax(0,1.2fr)_28px] items-center gap-2'
                      >
                        <Switch
                          size='small'
                          checked={header.enabled}
                          onChange={(checked) =>
                            updateHeader(header.id, { enabled: checked })
                          }
                        />
                        <Input
                          value={header.key}
                          onChange={(event) =>
                            updateHeader(header.id, {
                              key: event.target.value,
                            })
                          }
                          placeholder='Header'
                          className={darkFieldClassName}
                        />
                        <Input
                          value={header.value}
                          onChange={(event) =>
                            updateHeader(header.id, {
                              value: event.target.value,
                            })
                          }
                          placeholder='Value'
                          className={darkFieldClassName}
                        />
                        <Button
                          type='text'
                          size='small'
                          className='!text-zinc-400 hover:!text-red-300'
                          icon={<Trash2 className='size-3.5' />}
                          onClick={() => removeHeader(header.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {methodAllowsBody(method) ? (
                  <div>
                    <div className='mb-2 text-[11px] font-medium tracking-[0.12em] text-zinc-300 uppercase'>
                      {t('docs.debug.body')}
                    </div>
                    <Input.TextArea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      autoSize={{ minRows: 6, maxRows: 14 }}
                      spellCheck={false}
                      className={darkTextAreaClassName}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className='border-border/70 bg-card overflow-hidden rounded-2xl border shadow-sm'>
              <div className='border-border/60 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5'>
                <div className='flex items-center gap-2'>
                  <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    {t('docs.debug.response')}
                  </span>
                  {response ? (
                    <>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold',
                          STATUS_TONE_CLASS[tone]
                        )}
                      >
                        {response.status || 'ERR'} {response.statusText || ''}
                      </span>
                      <span className='text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px]'>
                        <Clock3 className='size-3' />
                        {response.durationMs} ms
                      </span>
                    </>
                  ) : null}
                </div>
                <div className='flex items-center gap-2'>
                  <label className='text-muted-foreground flex items-center gap-2 text-xs'>
                    <Switch
                      size='small'
                      checked={showResponseHeaders}
                      onChange={setShowResponseHeaders}
                    />
                    {t('docs.debug.responseHeaders')}
                  </label>
                  <Button
                    size='small'
                    type='text'
                    disabled={!response?.body}
                    icon={copiedBody ? <CheckOutlined /> : <CopyOutlined />}
                    onClick={() => void handleCopyResponse()}
                  >
                    {t('docs.copy')}
                  </Button>
                </div>
              </div>

              {error ? (
                <div className='border-b border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-600 dark:text-red-300'>
                  {error}
                </div>
              ) : null}

              {showResponseHeaders && response?.headers.length ? (
                <div className='border-border/50 max-h-36 overflow-auto border-b px-4 py-3'>
                  <dl className='space-y-1.5'>
                    {response.headers.map((header) => (
                      <div
                        key={`${header.key}:${header.value}`}
                        className='grid grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] gap-3 font-mono text-[11px]'
                      >
                        <dt className='text-muted-foreground truncate'>
                          {header.key}
                        </dt>
                        <dd className='truncate'>{header.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <pre className='bg-muted/35 max-h-[320px] min-h-32 overflow-auto p-4 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap'>
                {response?.body ||
                  (sending
                    ? t('docs.debug.sending')
                    : t('docs.debug.responseEmpty'))}
              </pre>
            </section>

            <section className='border-border/70 overflow-hidden rounded-2xl border'>
              <div className='border-border/60 bg-muted/30 flex items-center justify-between border-b px-4 py-2'>
                <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                  cURL
                </span>
                <Button
                  size='small'
                  type='text'
                  icon={copiedCurl ? <CheckOutlined /> : <CopyOutlined />}
                  onClick={() => void handleCopyCurl()}
                >
                  {t('docs.copy')}
                </Button>
              </div>
              <pre className='bg-muted/20 min-h-24 overflow-auto p-4 font-mono text-[11px] leading-5 break-all whitespace-pre-wrap text-zinc-800 dark:text-zinc-200'>
                {curl || t('docs.debug.urlRequired')}
              </pre>
            </section>
          </div>
        </div>

        <footer className='border-border/70 bg-background/95 shrink-0 border-t px-4 py-3 backdrop-blur sm:px-5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Button
              icon={<Eraser className='size-3.5' />}
              onClick={() => {
                setResponse(null)
                setError('')
              }}
            >
              {t('docs.debug.clearResponse')}
            </Button>
            <div className='flex gap-2'>
              <Button onClick={props.onClose}>{t('docs.debug.close')}</Button>
              <Button
                type='primary'
                loading={sending}
                icon={<Play className='size-3.5' />}
                onClick={() => void handleSend()}
              >
                {t('docs.debug.send')}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </Drawer>
  )
}
