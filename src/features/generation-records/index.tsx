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
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Empty,
  Input,
  Select,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { RefreshCw, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { SmartImage } from '@/components/smart-image'
import { publishCirclePost } from '@/features/creative-circle/api'
import {
  recordStillUrl,
  resolveCirclePublishCover,
} from '@/features/creative-circle/cover'
import { AssetMediaFacts } from '@/features/generation-assets/media-details'
import dayjs from '@/lib/dayjs'
import { formatTimestampToDate } from '@/lib/format'

import {
  generationRecordUrl,
  listMyGenerationRecords,
  type GenerationRecord,
} from './api'

const PAGE_SIZE = 10

const STATUS_COLOR: Record<string, string> = {
  success: 'green',
  failed: 'red',
  pending: 'gold',
}

function statusLabel(status: string) {
  if (status === 'success') return 'Success'
  if (status === 'failed') return 'Failed'
  if (status === 'pending') return 'In Progress'
  return status || 'Pending'
}

function kindLabel(kind: string) {
  if (kind === 'image') return 'Image'
  if (kind === 'video') return 'Video'
  return kind
}

function sourceLabel(source: string) {
  if (source === 'workbench') return 'Workbench'
  if (source === 'canvas') return 'Canvas'
  if (source === 'api') return 'API'
  return source
}

function isVideoRecord(record: GenerationRecord, url: string) {
  return record.kind === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(url)
}

function MediaUnavailableNotice({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  const message = t(
    'This media is unavailable. Images and videos on this platform are kept for 2 days only — download them soon if you need a copy.'
  )
  return (
    <div
      className={
        compact
          ? 'text-muted-foreground flex size-14 items-center justify-center rounded-md bg-amber-500/10 px-1 text-center text-[10px] leading-tight'
          : 'text-muted-foreground flex min-h-40 items-center justify-center px-4 text-center text-sm leading-6'
      }
      title={message}
    >
      {compact ? t('Unavailable') : message}
    </div>
  )
}

function RecordThumb({ record }: { record: GenerationRecord }) {
  const url = generationRecordUrl(record)
  const still = recordStillUrl(record)
  if (!url) {
    if (record.status === 'pending') {
      return <div className='bg-muted size-14 rounded-md' />
    }
    return <MediaUnavailableNotice compact />
  }
  if (!still) {
    return <div className='bg-muted size-14 rounded-md' />
  }
  return (
    <SmartImage
      src={still}
      alt=''
      className='bg-muted size-14 rounded-md object-cover'
      fallbackIconClassName='size-4'
      fallback={<MediaUnavailableNotice compact />}
    />
  )
}

function RecordDetail({ record }: { record: GenerationRecord }) {
  const { t } = useTranslation()
  const [broken, setBroken] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const url = generationRecordUrl(record)
  const prompt = record.prompt?.trim() || ''
  const isVideo = isVideoRecord(record, url)
  const showMedia = Boolean(url) && !broken
  const pendingWithoutMedia = !url && record.status === 'pending'
  const still = recordStillUrl(record)
  const publishMutation = useMutation({
    mutationFn: async () => {
      const cover = await resolveCirclePublishCover(record, coverFile)
      if (record.kind === 'video' && !cover) {
        throw new Error('Add a cover image before publishing')
      }
      return publishCirclePost({
        generation_asset_id: record.id,
        title: record.title || undefined,
        cover_url: cover,
      })
    },
    onSuccess: (post) => {
      toast.success(
        post.status === 'pending'
          ? t('Submitted for review — only you can see it until approved')
          : t('Published to Creative Circle')
      )
    },
    onError: (err: Error) => toast.error(err.message || t('Publish failed')),
  })

  return (
    <div className='space-y-4'>
      <Alert
        type='warning'
        showIcon
        message={t(
          'Images and videos on this platform are kept for 2 days only. Download them soon if you need to keep a copy.'
        )}
      />
      <div className='bg-muted overflow-hidden rounded-lg'>
        {showMedia && isVideo ? (
          <video
            src={url}
            poster={still || undefined}
            controls
            playsInline
            preload='none'
            onError={() => setBroken(true)}
            className='max-h-[420px] w-full object-contain'
          />
        ) : null}
        {showMedia && !isVideo ? (
          <SmartImage
            src={url}
            alt={prompt || t('Generation records')}
            className='max-h-[420px] w-full object-contain'
            onError={() => setBroken(true)}
            fallback={<MediaUnavailableNotice />}
          />
        ) : null}
        {pendingWithoutMedia ? (
          <div className='text-muted-foreground flex h-40 items-center justify-center px-4 text-center text-sm'>
            {t('No generation result yet')}
          </div>
        ) : null}
        {!showMedia && !pendingWithoutMedia ? <MediaUnavailableNotice /> : null}
      </div>
      <div className='flex flex-wrap gap-2'>
        {url && !broken ? (
          <Button href={url} target='_blank' rel='noreferrer'>
            {t('Download')}
          </Button>
        ) : null}
        {record.status === 'success' && url ? (
          <>
            <label className='border-border/60 inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm'>
              {t('Custom cover')}
              <input
                type='file'
                accept='image/*'
                className='hidden'
                onChange={(event) => {
                  setCoverFile(event.target.files?.[0] || null)
                }}
              />
            </label>
            <Button
              type='primary'
              icon={<Share2 className='size-3.5' />}
              loading={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              {t('Publish to Creative Circle')}
            </Button>
          </>
        ) : null}
      </div>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Tag className='m-0'>{t(kindLabel(record.kind))}</Tag>
        <Tag color={STATUS_COLOR[record.status] || 'default'} className='m-0'>
          {t(statusLabel(record.status))}
        </Tag>
        {record.source ? (
          <Tag className='m-0'>{t(sourceLabel(record.source))}</Tag>
        ) : null}
        {record.model ? (
          <span className='text-muted-foreground text-xs'>{record.model}</span>
        ) : null}
        <span className='text-muted-foreground text-xs'>
          {formatTimestampToDate(record.created_at)}
        </span>
      </div>
      {record.assets?.map((file, index) => (
        <AssetMediaFacts key={`${file.url || 'file'}-${index}`} file={file} t={t} />
      ))}
      {record.title ? (
        <div className='text-sm font-medium'>{record.title}</div>
      ) : null}
      {prompt ? (
        <pre className='bg-muted whitespace-pre-wrap rounded-lg p-3 text-sm leading-6'>
          {prompt}
        </pre>
      ) : null}
      {record.error ? (
        <p className='text-sm text-red-500'>{record.error}</p>
      ) : null}
    </div>
  )
}

export function GenerationRecords() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [source, setSource] = useState<string>()
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [startTime, setStartTime] = useState<Date>()
  const [endTime, setEndTime] = useState<Date>()
  const [detail, setDetail] = useState<GenerationRecord | null>(null)

  const query = useInfiniteQuery({
    queryKey: [
      'my-generation-records',
      kind,
      status,
      source,
      keyword,
      startTime?.getTime(),
      endTime?.getTime(),
    ],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      listMyGenerationRecords({
        cursor: pageParam,
        limit: PAGE_SIZE,
        kind,
        status,
        source,
        keyword,
        startTimestamp: startTime?.getTime(),
        endTimestamp: endTime?.getTime(),
      }),
    getNextPageParam: (last) => (last.has_more && last.next_cursor ? last.next_cursor : undefined),
  })

  const items = query.data?.pages.flatMap((page) => page.items) || []
  const hasFilter = Boolean(keyword || kind || status || source || startTime || endTime)

  const columns: ColumnsType<GenerationRecord> = [
    {
      title: t('Result'),
      width: 88,
      render: (_value, record) => <RecordThumb record={record} />,
    },
    {
      title: t('Prompt'),
      dataIndex: 'prompt',
      ellipsis: true,
      render: (_value, record) => {
        const prompt = record.prompt?.trim() || record.title?.trim() || '—'
        return (
          <div className='min-w-0'>
            {record.title ? (
              <div className='truncate text-sm font-medium'>{record.title}</div>
            ) : null}
            <div className='text-muted-foreground line-clamp-2 text-sm leading-5'>
              {prompt}
            </div>
          </div>
        )
      },
    },
    {
      title: t('Kind'),
      dataIndex: 'kind',
      width: 96,
      render: (value: string) => <Tag className='m-0'>{t(kindLabel(value))}</Tag>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      width: 104,
      render: (value: string) => (
        <Tag color={STATUS_COLOR[value] || 'default'} className='m-0'>
          {t(statusLabel(value))}
        </Tag>
      ),
    },
    {
      title: t('Source'),
      dataIndex: 'source',
      width: 120,
      render: (value: string) =>
        value ? <span className='text-sm'>{t(sourceLabel(value))}</span> : '—',
    },
    {
      title: t('Model'),
      dataIndex: 'model',
      width: 180,
      ellipsis: true,
      render: (value: string) => value || '—',
    },
    {
      title: t('Created'),
      dataIndex: 'created_at',
      width: 168,
      render: (value: number) => (
        <span className='text-muted-foreground text-sm'>
          {formatTimestampToDate(value)}
        </span>
      ),
    },
  ]

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Generation records')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            icon={<RefreshCw className='size-4' />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <Alert
            type='warning'
            showIcon
            className='mb-3'
            message={t(
              'Images and videos on this platform are kept for 2 days only. Download them soon if you need to keep a copy.'
            )}
          />
          <div className='mb-3 flex flex-wrap items-center gap-2'>
            <Input.Search
              allowClear
              className='w-72'
              placeholder={t('Search prompt, title, or model')}
              value={keywordInput}
              onChange={(event) => {
                const next = event.target.value
                setKeywordInput(next)
                if (!next) {
                  setKeyword('')
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim())
                setKeywordInput(value.trim())
              }}
            />
            <DatePicker.RangePicker
              showTime
              allowClear
              value={
                startTime && endTime ? [dayjs(startTime), dayjs(endTime)] : null
              }
              onChange={(values) => {
                setStartTime(values?.[0]?.toDate())
                setEndTime(values?.[1]?.toDate())
              }}
            />
            <Select
              allowClear
              placeholder={t('Kind')}
              value={kind}
              className='w-28'
              options={[
                { value: 'image', label: t('Image') },
                { value: 'video', label: t('Video') },
              ]}
              onChange={(value) => {
                setKind(value)
              }}
            />
            <Select
              allowClear
              placeholder={t('Status')}
              value={status}
              className='w-28'
              options={[
                { value: 'success', label: t('Success') },
                { value: 'pending', label: t('In Progress') },
                { value: 'failed', label: t('Failed') },
              ]}
              onChange={(value) => {
                setStatus(value)
              }}
            />
            <Select
              allowClear
              placeholder={t('Source')}
              value={source}
              className='w-32'
              options={[
                { value: 'workbench', label: t('Workbench') },
                { value: 'canvas', label: t('Canvas') },
                { value: 'api', label: t('API') },
              ]}
              onChange={(value) => {
                setSource(value)
              }}
            />
          </div>
          {query.isError ? (
            <ErrorState
              description={
                query.error instanceof Error
                  ? query.error.message
                  : t('No generation records yet')
              }
              onRetry={() => void query.refetch()}
            />
          ) : (
            <>
              <Table<GenerationRecord>
                rowKey='id'
                size='middle'
                loading={query.isLoading}
                columns={columns}
                dataSource={items}
                scroll={{ x: 960 }}
                pagination={false}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        hasFilter
                          ? t('No matching results')
                          : t('No generation records yet')
                      }
                    />
                  ),
                }}
                onRow={(record) => ({
                  onClick: () => setDetail(record),
                  className: 'cursor-pointer',
                })}
              />
              {query.hasNextPage ? (
                <div className='flex justify-center py-4'>
                  <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                    {t('Load more')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <Drawer
        open={detail != null}
        title={detail?.title || t('Generation records')}
        size='large'
        onClose={() => setDetail(null)}
      >
        {detail ? <RecordDetail record={detail} /> : null}
      </Drawer>
    </>
  )
}
