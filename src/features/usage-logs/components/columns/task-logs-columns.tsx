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
import type { ColumnDef } from '@tanstack/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button } from 'antd'
import { Music } from 'lucide-react'
/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { TASK_STATUS } from '../../constants'
import { adminRefreshTaskFromUpstream } from '../../api'
import { taskActionMapper, taskStatusMapper } from '../../lib/mappers'
import type { TaskLog } from '../../types'
import {
  AudioPreviewDialog,
  type AudioClip,
} from '../dialogs/audio-preview-dialog'
import { TaskDetailsTrigger } from '../dialogs/task-details-dialog'
import { ModelBadge } from '../model-badge'
import {
  QuotaChangeBadge,
  resolveTaskQuotaChange,
} from '../quota-change-badge'
import {
  useLogsViewScope,
  useUsageLogsContext,
} from '../usage-logs-provider'
import {
  createDurationColumn,
  createChannelColumn,
  createProgressColumn,
} from './column-helpers'

function parseTaskData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function AudioPreviewCell({ log }: { log: TaskLog }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const clips = useMemo(() => {
    const data = parseTaskData(log.data)
    return data.filter(
      (c) =>
        c && typeof c === 'object' && (c as Record<string, unknown>).audio_url
    )
  }, [log.data])

  if (clips.length === 0) return null

  return (
    <>
      <button
        type='button'
        className='group flex items-center gap-1 text-left text-xs'
        onClick={() => setOpen(true)}
      >
        <Music className='text-muted-foreground size-3' />
        <span className='text-foreground leading-snug group-hover:underline'>
          {t('Click to preview audio')}
        </span>
      </button>
      <AudioPreviewDialog
        open={open}
        onOpenChange={setOpen}
        clips={clips as AudioClip[]}
      />
    </>
  )
}

function AdminPullUpstreamButton({ taskId }: { taskId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  return (
    <Button
      size='small'
      loading={pending}
      disabled={!taskId || pending}
      onClick={() => {
        if (!taskId || pending) return
        setPending(true)
        void adminRefreshTaskFromUpstream(taskId)
          .then(async (result) => {
            if (result.fetch_error) {
              toast.error(result.fetch_error)
            }
            if (result.asset_created) {
              toast.success(
                t('Pulled from upstream and created the generation asset')
              )
            } else if (!result.fetch_error) {
              toast.success(t('Pulled from upstream'))
            }
            await queryClient.invalidateQueries({ queryKey: ['logs'] })
          })
          .catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : t('Pull failed'))
          })
          .finally(() => setPending(false))
      }}
    >
      {t('Pull from upstream')}
    </Button>
  )
}

export function useTaskLogsColumns(isAdmin: boolean): ColumnDef<TaskLog>[] {
  const { t } = useTranslation()
  const { isAdminView } = useLogsViewScope()
  const columns: ColumnDef<TaskLog>[] = [
    {
      accessorKey: 'submit_time',
      header: t('Submit Time'),
      cell: ({ row }) => {
        const log = row.original
        const submitTime = row.getValue('submit_time') as number

        return (
          <div className='flex min-w-0 flex-col gap-0.5'>
            <span className='truncate font-mono text-xs tabular-nums'>
              {formatTimestampToDate(submitTime, 'seconds')}
            </span>
            {log.finish_time ? (
              <span className='text-muted-foreground/60 truncate font-mono text-[11px] tabular-nums'>
                {formatTimestampToDate(log.finish_time, 'seconds')}
              </span>
            ) : (
              <span className='text-muted-foreground/50 text-[11px]'>-</span>
            )}
          </div>
        )
      },
      size: 180,
    },
  ]

  if (isAdmin) {
    columns.push(createChannelColumn<TaskLog>({ headerLabel: t('Channel') }), {
      id: 'user',
      header: t('User'),
      accessorFn: (row) => row.username || row.user_id,
      cell: function UserCell({ row }) {
        const { sensitiveVisible, setSelectedUserId, setUserInfoDialogOpen } =
          useUsageLogsContext()
        const log = row.original
        const displayName = log.username || String(log.user_id || '?')

        return (
          <button
            type='button'
            className='flex items-center gap-1.5 text-left'
            onClick={(e) => {
              e.stopPropagation()
              setSelectedUserId(log.user_id)
              setUserInfoDialogOpen(true)
            }}
          >
            <Avatar
              size={24}
              className={cn(
                'ring-border/60 text-[11px] font-semibold ring-1 max-sm:hidden',
                !sensitiveVisible && 'bg-muted text-muted-foreground'
              )}
              style={
                sensitiveVisible ? getUserAvatarStyle(displayName) : undefined
              }
            >
              {sensitiveVisible ? getUserAvatarFallback(displayName) : '•'}
            </Avatar>
            <span className='text-muted-foreground truncate text-sm hover:underline'>
              {sensitiveVisible ? displayName : '••••'}
            </span>
          </button>
        )
      },
    })
  }

  columns.push(
    {
      accessorKey: 'task_id',
      header: t('Task ID'),
      cell: ({ row }) => {
        const log = row.original
        const taskId = row.getValue('task_id') as string
        if (!taskId) {
          return <span className='text-muted-foreground/60 text-xs'>-</span>
        }
        return (
          <div className='flex max-w-[170px] flex-col gap-0.5'>
            <StatusBadge
              label={taskId}
              copyText={taskId}
              variant='neutral'
              size='sm'
              className='border-border/60 bg-muted/30 !text-foreground max-w-full truncate rounded-md border px-1.5 py-0.5 font-mono'
            />
            <span className='text-muted-foreground/60 truncate text-[11px]'>
              {t(log.platform)} · {t(taskActionMapper.getLabel(log.action))}
            </span>
          </div>
        )
      },
      meta: { mobileTitle: true },
    },
    {
      id: 'model',
      header: t('Model'),
      accessorFn: (row) =>
        row.model ||
        row.properties?.origin_model_name ||
        '',
      cell: ({ row }) => {
        const modelName =
          row.original.model ||
          row.original.properties?.origin_model_name ||
          ''
        if (!modelName) {
          return <span className='text-muted-foreground/60 text-xs'>-</span>
        }
        return (
          <ModelBadge
            modelName={modelName}
            className='max-w-[180px]'
          />
        )
      },
      size: 180,
    },
    createDurationColumn<TaskLog>({
      submitTimeKey: 'submit_time',
      finishTimeKey: 'finish_time',
      unit: 'seconds',
      headerLabel: t('Duration'),
      warningThresholdSec: 300,
    }),
    {
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        const running =
          status === TASK_STATUS.IN_PROGRESS || status === TASK_STATUS.QUEUED
        return (
          <StatusBadge
            label={t(taskStatusMapper.getLabel(status, status || 'Submitting'))}
            variant={taskStatusMapper.getVariant(status)}
            size='sm'
            copyable={false}
            pulse={running}
            className='-ml-1.5'
          />
        )
      },
    },
    createProgressColumn<TaskLog>({ headerLabel: t('Progress') }),
    {
      id: 'result',
      header: t('Result'),
      accessorFn: (row) => row.result_url || '',
      cell: function ResultCell({ row }) {
        const log = row.original
        const mirrored = log.result_url?.trim() || ''
        const upstream =
          log.status === TASK_STATUS.SUCCESS
            ? log.upstream_url?.trim() || ''
            : ''
        const url = mirrored || upstream
        if (!url) {
          return (
            <span className='text-muted-foreground/60 text-xs'>
              {log.status === TASK_STATUS.SUCCESS
                ? t('No generation result yet')
                : '-'}
            </span>
          )
        }
        const isUpstream = !mirrored
        const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url)
        return (
          <button
            type='button'
            className='group flex max-w-[140px] items-center gap-2 text-left'
            onClick={() => {
              // Open details drawer via clicking details is separate; here open media
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
            title={isUpstream ? t('Upstream') : t('Open mirrored result')}
          >
            <span className='bg-muted relative size-10 shrink-0 overflow-hidden rounded-md border'>
              {isVideo ? (
                <video
                  src={`${url}#t=0.1`}
                  muted
                  playsInline
                  preload='metadata'
                  className='size-full object-cover'
                />
              ) : (
                <img
                  src={url}
                  alt=''
                  referrerPolicy='no-referrer'
                  className='size-full object-cover'
                />
              )}
            </span>
            <span className='text-foreground truncate text-xs group-hover:underline'>
              {isUpstream ? t('Upstream') : t('Preview')}
            </span>
          </button>
        )
      },
      size: 160,
    },
    {
      accessorKey: 'fail_reason',
      header: t('Details'),
      cell: function DetailsCell({ row }) {
        const log = row.original
        const failReason = row.getValue('fail_reason') as string
        const status = log.status

        const isSunoSuccess =
          log.platform === 'suno' && status === TASK_STATUS.SUCCESS
        if (isSunoSuccess) {
          const data = parseTaskData(log.data)
          if (
            data.some(
              (c) =>
                c &&
                typeof c === 'object' &&
                (c as Record<string, unknown>).audio_url
            )
          ) {
            return <AudioPreviewCell log={log} />
          }
        }

        const preview =
          failReason && !/^https?:\/\//i.test(failReason.trim())
            ? failReason
            : undefined

        return (
          <TaskDetailsTrigger
            log={log}
            isAdmin={isAdminView}
            preview={preview}
          />
        )
      },
      size: 200,
      maxSize: 220,
    },
    {
      accessorKey: 'quota',
      header: t('Amount change'),
      cell: ({ row }) => {
        const change = resolveTaskQuotaChange(row.original)
        return <QuotaChangeBadge change={change} />
      },
      size: 120,
    }
  )

  if (isAdmin) {
    columns.push({
      accessorKey: 'user_quota',
      header: t('User balance'),
      cell: ({ row }) => {
        const balance =
          row.original.user_quota_after ?? row.original.user_quota
        if (balance == null) {
          return <span className='text-muted-foreground/60 text-xs'>-</span>
        }
        return (
          <span className='border-border/80 bg-muted/40 inline-flex h-6 w-fit items-center rounded-md border px-2 [font-family:var(--font-body)] text-sm leading-none font-medium tabular-nums'>
            {formatLogQuota(balance)}
          </span>
        )
      },
      size: 120,
    })
    columns.push({
      id: 'pull-upstream',
      header: '',
      cell: ({ row }) => (
        <AdminPullUpstreamButton taskId={row.original.task_id || ''} />
      ),
      size: 148,
      enableSorting: false,
    })
  }

  return columns
}
