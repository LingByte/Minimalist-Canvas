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
import { Button, Drawer, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Copy, ExternalLink, Eye, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import {
  adminGetTaskDetail,
  type AdminTaskDetail,
} from '@/features/generation-assets/api'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'

import { getUserTaskDetail } from '../../api'
import { taskActionMapper, taskStatusMapper } from '../../lib/mappers'
import type { TaskLog } from '../../types'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground mb-1 text-xs'>{label}</div>
      <div className='break-all text-sm font-medium'>{value}</div>
    </div>
  )
}

function formatTs(value?: number | null) {
  if (!value) return '-'
  return formatTimestampToDate(value, 'seconds')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function countMediaRefs(value: unknown): number {
  if (!Array.isArray(value)) return 0
  return value.filter((item) => typeof item === 'string' && item.trim()).length
}

type PayloadRow = { key: string; label: string; value: string }

/** Prefer generation params; skip nested relay/task bookkeeping blobs. */
function extractGenerationPayload(raw: unknown): Record<string, unknown> | null {
  const root = asRecord(raw)
  if (!root) return null

  const candidates: Record<string, unknown>[] = [root]
  const nested = asRecord(root.data)
  if (nested) {
    candidates.unshift(nested)
    const deeper = asRecord(nested.data)
    if (
      deeper &&
      (deeper.model != null ||
        deeper.prompt != null ||
        deeper.aspect_ratio != null ||
        deeper.resolution != null ||
        deeper.size != null)
    ) {
      candidates.unshift(deeper)
    }
  }

  for (const candidate of candidates) {
    if (
      candidate.model != null ||
      candidate.prompt != null ||
      candidate.aspect_ratio != null ||
      candidate.resolution != null ||
      candidate.size != null ||
      candidate.seconds != null ||
      candidate.duration != null ||
      candidate.images != null
    ) {
      return candidate
    }
  }
  return root
}

function buildPayloadRows(
  payload: Record<string, unknown> | null,
  t: (key: string) => string
): { rows: PayloadRow[]; prompt: string } {
  const source = { ...(payload || {}) }
  const prompt = pickString(source.prompt, source.input)
  const imageCount =
    countMediaRefs(source.images) ||
    countMediaRefs(source.image_urls) ||
    countMediaRefs(source.reference_images)

  const defs: Array<{ key: string; label: string; value: string }> = [
    {
      key: 'model',
      label: t('Model'),
      value: pickString(source.model, source.origin_model_name),
    },
    {
      key: 'aspect_ratio',
      label: t('Aspect ratio'),
      value: pickString(source.aspect_ratio, source.ratio),
    },
    {
      key: 'resolution',
      label: t('Resolution'),
      value: pickString(source.resolution),
    },
    {
      key: 'size',
      label: t('Size'),
      value: pickString(source.size),
    },
    {
      key: 'seconds',
      label: t('Seconds'),
      value: pickString(source.seconds, source.duration),
    },
    {
      key: 'status',
      label: t('Upstream status'),
      value: pickString(source.status, source.progress_text),
    },
    {
      key: 'progress',
      label: t('Upstream progress'),
      value: pickString(
        source.progress_text,
        typeof source.progress === 'number'
          ? `${source.progress}%`
          : source.progress
      ),
    },
    {
      key: 'images',
      label: t('Reference images'),
      value: imageCount > 0 ? String(imageCount) : '',
    },
  ]

  return {
    rows: defs
      .filter((item) => item.value)
      .map((item) => ({
        key: item.key,
        label: item.label,
        value: item.value,
      })),
    prompt,
  }
}

function copyText(value: string, okLabel: string, failLabel: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(okLabel),
    () => toast.error(failLabel)
  )
}

function GenerationResultSection({
  view,
  fallbackUrl,
}: {
  view: AdminTaskDetail | null
  fallbackUrl?: string
}) {
  const { t } = useTranslation()
  const urls = useMemo(() => {
    const fromAssets = (view?.assets || [])
      .map((file) => file.url?.trim() || '')
      .filter(Boolean)
    if (fromAssets.length > 0) return fromAssets
    const url = view?.result_url?.trim() || fallbackUrl?.trim() || ''
    return url ? [url] : []
  }, [view?.assets, view?.result_url, fallbackUrl])

  if (urls.length === 0) {
    return (
      <div className='rounded-lg border border-dashed p-4'>
        <div className='text-sm font-medium'>{t('Generation result')}</div>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('No generation result yet')}
        </p>
      </div>
    )
  }

  const kind = (view?.asset_kind || '').toLowerCase()

  return (
    <div className='space-y-3'>
      <div className='text-sm font-medium'>{t('Generation result')}</div>
      <div className='grid gap-3'>
        {urls.map((url, index) => {
          const isVideo =
            kind === 'video' ||
            /\.(mp4|webm|mov)(\?|$)/i.test(url)
          return (
            <div
              key={`${url}-${index}`}
              className='overflow-hidden rounded-lg border'
            >
              <div className='bg-black'>
                {isVideo ? (
                  <video
                    src={url}
                    controls
                    playsInline
                    preload='metadata'
                    className='max-h-80 w-full object-contain'
                  />
                ) : (
                  <img
                    src={url}
                    alt={t('Generation result')}
                    referrerPolicy='no-referrer'
                    className='max-h-80 w-full object-contain'
                  />
                )}
              </div>
              <div className='flex items-start gap-2 p-3'>
                <a
                  href={url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='min-w-0 flex-1 break-all text-xs text-blue-600 hover:underline dark:text-blue-400'
                >
                  {url}
                </a>
                <Button
                  type='text'
                  size='small'
                  icon={<Copy className='size-3.5' />}
                  onClick={() =>
                    copyText(url, t('Copied to clipboard'), t('Copy failed'))
                  }
                />
                <Button
                  type='text'
                  size='small'
                  icon={<ExternalLink className='size-3.5' />}
                  href={url}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface TaskDetailsDialogProps {
  log: TaskLog
  isAdmin: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskDetailsDialog({
  log,
  isAdmin,
  open,
  onOpenChange,
}: TaskDetailsDialogProps) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<AdminTaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadDetail = async () => {
    const taskId = log.task_id?.trim()
    if (!taskId) {
      setError(t('Task ID is missing'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = isAdmin
        ? await adminGetTaskDetail(taskId)
        : await getUserTaskDetail(taskId)
      setDetail(result)
    } catch (err) {
      setDetail(null)
      setError(
        err instanceof Error ? err.message : t('Failed to load task detail')
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setDetail(null)
      setError('')
      return
    }
    void loadDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when drawer opens for this task
  }, [open, log.task_id, isAdmin])

  const view = detail
  const status = view?.status || log.status
  const properties =
    view?.properties && typeof view.properties === 'object'
      ? (view.properties as Record<string, unknown>)
      : null

  const payloadSummary = useMemo(() => {
    return buildPayloadRows(extractGenerationPayload(view?.data), t)
  }, [view?.data, t])

  const promptText =
    payloadSummary.prompt ||
    (typeof properties?.input === 'string' ? properties.input.trim() : '')

  const payloadColumns: ColumnsType<PayloadRow> = [
    {
      title: t('Field'),
      dataIndex: 'label',
      width: 160,
      render: (value: string) => (
        <span className='text-muted-foreground text-xs'>{value}</span>
      ),
    },
    {
      title: t('Value'),
      dataIndex: 'value',
      render: (value: string) => (
        <span className='break-all text-sm font-medium'>{value}</span>
      ),
    },
  ]

  return (
    <Drawer
      open={open}
      onClose={() => onOpenChange(false)}
      width='50vw'
      destroyOnHidden
      title={
        <div className='flex flex-wrap items-center gap-2 pr-4'>
          <span>{t('Task Detail')}</span>
          {log.task_id ? (
            <StatusBadge
              label={log.task_id}
              copyText={log.task_id}
              variant='neutral'
              size='sm'
              className='border-border/60 bg-muted/30 !text-foreground max-w-[280px] truncate rounded-md border px-1.5 py-0.5 font-mono'
            />
          ) : null}
        </div>
      }
      extra={
        <Button
          size='small'
          icon={<RefreshCw className='size-3.5' />}
          loading={loading}
          onClick={() => void loadDetail()}
        >
          {t('Refresh')}
        </Button>
      }
    >
      <div className='mb-4 flex flex-wrap items-center gap-2'>
        <StatusBadge
          label={t(taskStatusMapper.getLabel(status, status || 'Submitting'))}
          variant={taskStatusMapper.getVariant(status)}
          size='sm'
          copyable={false}
        />
        {(view?.progress || log.progress) && (
          <Tag>{view?.progress || log.progress}</Tag>
        )}
      </div>

      {loading && !view ? (
        <div className='flex justify-center py-16'>
          <Spin />
        </div>
      ) : null}

      {error ? (
        <div className='mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400'>
          {error}
        </div>
      ) : null}

      {view || !loading ? (
        <div className='space-y-5'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field
              label={t('Platform')}
              value={t(view?.platform || log.platform) || '-'}
            />
            <Field
              label={t('Action')}
              value={t(taskActionMapper.getLabel(view?.action || log.action))}
            />
            {isAdmin ? (
              <Field
                label={t('Channel ID')}
                value={String(view?.channel_id ?? log.channel_id ?? '-')}
              />
            ) : null}
            <Field label={t('Group')} value={view?.group || log.group || '-'} />
            {isAdmin || view?.username ? (
              <Field
                label={t('Username')}
                value={
                  view?.username ||
                  log.username ||
                  `#${view?.user_id ?? log.user_id}`
                }
              />
            ) : null}
            <Field
              label={t('Upstream Task ID')}
              value={view?.upstream_task_id || '-'}
            />
            <Field
              label={t('Quota')}
              value={formatLogQuota(view?.quota ?? log.quota ?? 0)}
            />
            <Field
              label={t('Submit Time')}
              value={formatTs(view?.submit_time ?? log.submit_time)}
            />
            <Field
              label={t('Start Time')}
              value={formatTs(view?.start_time ?? log.start_time)}
            />
            <Field
              label={t('Finish Time')}
              value={formatTs(view?.finish_time ?? log.finish_time)}
            />
            <Field
              label={t('Created At')}
              value={formatTs(view?.created_at ?? log.created_at)}
            />
            <Field
              label={t('Updated At')}
              value={formatTs(view?.updated_at ?? log.updated_at)}
            />
            {isAdmin && view?.request_id ? (
              <Field label={t('Request ID')} value={view.request_id} />
            ) : null}
            {isAdmin && view?.client_ip ? (
              <Field label={t('IP')} value={view.client_ip} />
            ) : null}
            {isAdmin && view?.token_id ? (
              <Field label={t('Token ID')} value={String(view.token_id)} />
            ) : null}
            {isAdmin && view?.token_name ? (
              <Field label={t('Token Name')} value={view.token_name} />
            ) : null}
            {isAdmin && view?.origin ? (
              <Field label={t('Origin')} value={view.origin} />
            ) : null}
            {isAdmin && view?.path ? (
              <Field label={t('Path')} value={view.path} />
            ) : null}
            {isAdmin && view?.attempt_id ? (
              <Field label={t('Attempt ID')} value={view.attempt_id} />
            ) : null}
            {isAdmin && view?.user_agent ? (
              <div className='sm:col-span-2'>
                <Field label={t('User Agent')} value={view.user_agent} />
              </div>
            ) : null}
          </div>

          {(view?.fail_reason || log.fail_reason) &&
          !/^https?:\/\//i.test(
            (view?.fail_reason || log.fail_reason || '').trim()
          ) ? (
            <div>
              <div className='text-muted-foreground mb-1 text-xs'>
                {t('Fail Reason')}
              </div>
              <pre className='bg-muted max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-sm leading-6 text-red-500'>
                {view?.fail_reason || log.fail_reason}
              </pre>
            </div>
          ) : null}

          <GenerationResultSection
            view={view}
            fallbackUrl={log.result_url || log.upstream_url}
          />

          {payloadSummary.rows.length > 0 || promptText ? (
            <div className='space-y-3'>
              <div className='text-sm font-medium'>{t('Generation params')}</div>
              {payloadSummary.rows.length > 0 ? (
                <Table
                  size='small'
                  pagination={false}
                  rowKey='key'
                  columns={payloadColumns}
                  dataSource={payloadSummary.rows}
                />
              ) : null}
              {promptText ? (
                <div>
                  <div className='text-muted-foreground mb-1 text-xs'>
                    {t('Prompt')}
                  </div>
                  <pre className='bg-muted max-h-72 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-sm leading-6'>
                    {promptText}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  )
}

export function TaskDetailsTrigger({
  log,
  isAdmin,
  preview,
}: {
  log: TaskLog
  isAdmin: boolean
  preview?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type='button'
        className='group flex max-w-[200px] items-center gap-1 text-left text-xs'
        onClick={() => setOpen(true)}
        title={t('Click to view full details')}
      >
        <Eye className='text-muted-foreground size-3 shrink-0' />
        <span
          className={
            preview
              ? 'truncate leading-snug text-red-600 group-hover:underline dark:text-red-400'
              : 'text-foreground truncate leading-snug group-hover:underline'
          }
        >
          {preview || t('View details')}
        </span>
      </button>
      <TaskDetailsDialog
        log={log}
        isAdmin={isAdmin}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
