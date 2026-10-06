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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  Pagination,
  Select,
  Tag,
  Upload,
} from 'antd'
import { ImagePlus, Plus, Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { SmartImage } from '@/components/smart-image'
import { SectionPageLayout } from '@/components/layout'
import { TagInput } from '@/components/tag-input'
import { uploadToObjectStorage } from '@/features/infinite-canvas/services/object-storage'
import { PROMPT_COVER_PLACEHOLDER } from '@/features/prompt-templates/constants'
import { CoverGenerateDialog } from '@/features/prompt-templates/cover-generate-dialog'
import { formatTimestampToDate } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  listMyPromptSubmissions,
  listPromptLibrary,
  listReviewSubmissions,
  reviewPromptSubmission,
  submitPrompt,
  type LibraryPrompt,
  type PromptSubmission,
} from './api'

const PAGE_SIZE = 12

function statusLabel(status: string) {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Pending review'
}

function statusColor(status: string) {
  if (status === 'approved') return 'green'
  if (status === 'rejected') return 'red'
  return 'gold'
}

export type PromptLibraryTab = 'library' | 'mine' | 'review'

export function PromptLibrary({
  initialTab,
}: {
  initialTab?: PromptLibraryTab
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isAdmin = (useAuthStore((s) => s.auth.user?.role) ?? 0) >= ROLE.ADMIN
  const [tab, setTab] = useState<PromptLibraryTab>(
    initialTab === 'review' && !isAdmin ? 'library' : (initialTab ?? 'library')
  )
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<string>()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverGenOpen, setCoverGenOpen] = useState(false)
  const [coverGenPrompt, setCoverGenPrompt] = useState('')
  const [detail, setDetail] = useState<LibraryPrompt | null>(null)
  const [form] = Form.useForm<{
    title: string
    prompt: string
    description?: string
    cover_url?: string
    tags?: string[]
  }>()
  const coverUrl = Form.useWatch('cover_url', form)

  async function uploadCover(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t('Please upload an image'))
      return
    }
    setCoverUploading(true)
    try {
      const result = await uploadToObjectStorage(file, {
        filename: file.name,
        contentType: file.type,
        purpose: 'prompt-cover',
      })
      if (!result?.accessUrl) throw new Error(t('Upload failed'))
      form.setFieldValue('cover_url', result.accessUrl)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Upload failed'))
    } finally {
      setCoverUploading(false)
    }
  }

  const libraryQuery = useQuery({
    queryKey: ['prompt-library', page, keyword, category],
    queryFn: () =>
      listPromptLibrary({
        page,
        pageSize: PAGE_SIZE,
        keyword,
        category,
      }),
    enabled: tab === 'library',
  })
  const mineQuery = useQuery({
    queryKey: ['prompt-submissions-self', page],
    queryFn: () => listMyPromptSubmissions(page, PAGE_SIZE),
    enabled: tab === 'mine',
  })
  const reviewQuery = useQuery({
    queryKey: ['prompt-submissions-review', page],
    queryFn: () =>
      listReviewSubmissions({ page, pageSize: PAGE_SIZE, status: 'pending' }),
    enabled: tab === 'review' && isAdmin,
  })

  const submitMutation = useMutation({
    mutationFn: submitPrompt,
    onSuccess: () => {
      toast.success(t('Submission sent for review'))
      setSubmitOpen(false)
      form.resetFields()
      void queryClient.invalidateQueries({
        queryKey: ['prompt-submissions-self'],
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const reviewMutation = useMutation({
    mutationFn: (input: {
      id: number
      action: 'approve' | 'reject'
      note: string
    }) => reviewPromptSubmission(input.id, input.action, input.note),
    onSuccess: (_data, input) => {
      toast.success(input.action === 'approve' ? t('Approved') : t('Rejected'))
      void queryClient.invalidateQueries({
        queryKey: ['prompt-submissions-review'],
      })
      void queryClient.invalidateQueries({ queryKey: ['prompt-library'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const libraryItems = libraryQuery.data?.items || []
  const total =
    tab === 'library'
      ? libraryQuery.data?.total || 0
      : tab === 'mine'
        ? mineQuery.data?.total || 0
        : reviewQuery.data?.total || 0
  const activeError =
    tab === 'library'
      ? libraryQuery.error
      : tab === 'mine'
        ? mineQuery.error
        : reviewQuery.error
  const isError =
    tab === 'library'
      ? libraryQuery.isError
      : tab === 'mine'
        ? mineQuery.isError
        : reviewQuery.isError

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Prompt library')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            type={tab === 'library' ? 'primary' : 'default'}
            onClick={() => {
              setTab('library')
              setPage(1)
            }}
          >
            {t('Prompt library')}
          </Button>
          <Button
            type={tab === 'mine' ? 'primary' : 'default'}
            onClick={() => {
              setTab('mine')
              setPage(1)
            }}
          >
            {t('My submissions')}
          </Button>
          {isAdmin ? (
            <Button
              type={tab === 'review' ? 'primary' : 'default'}
              onClick={() => {
                setTab('review')
                setPage(1)
              }}
            >
              {t('Review submissions')}
            </Button>
          ) : null}
          <Button
            icon={<Plus className='size-4' />}
            onClick={() => setSubmitOpen(true)}
          >
            {t('Submit a prompt')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <p className='text-muted-foreground mb-3 text-sm'>
            {t(
              'Published prompt templates. Submit one and it appears here after review.'
            )}
          </p>
          {tab === 'library' ? (
            <div className='mb-3 flex flex-wrap gap-2'>
              <Input
                allowClear
                className='max-w-sm'
                prefix={<Search className='size-4' />}
                placeholder={t('Search')}
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setPage(1)
                }}
              />
              <Select
                allowClear
                className='w-44'
                placeholder={t('Category')}
                value={category}
                options={(libraryQuery.data?.categories || []).map((item) => ({
                  value: item,
                  label: item,
                }))}
                onChange={(value) => {
                  setCategory(value)
                  setPage(1)
                }}
              />
            </div>
          ) : null}
          {isError ? (
            <ErrorState
              description={
                activeError instanceof Error
                  ? activeError.message
                  : t('No prompts yet')
              }
            />
          ) : null}
          {tab === 'library' &&
          !libraryQuery.isLoading &&
          libraryItems.length === 0 ? (
            <Empty description={t('No prompts yet')} />
          ) : null}
          {tab === 'library' && libraryItems.length > 0 ? (
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
              {libraryItems.map((item) => (
                <button
                  key={`${item.category}-${item.id}`}
                  type='button'
                  className='bg-card hover:border-primary/40 flex cursor-pointer flex-col overflow-hidden rounded-lg border text-left'
                  onClick={() => setDetail(item)}
                >
                  <SmartImage
                    src={item.coverUrl || PROMPT_COVER_PLACEHOLDER}
                    alt=''
                    referrerPolicy='no-referrer'
                    className='bg-muted aspect-video w-full object-cover' />
                  <div className='flex flex-1 flex-col gap-2 p-3'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      {item.category ? (
                        <Tag className='m-0'>{item.category}</Tag>
                      ) : null}
                      {item.author ? (
                        <span className='text-muted-foreground truncate text-xs'>
                          {item.author}
                        </span>
                      ) : null}
                    </div>
                    <div className='line-clamp-1 text-sm font-medium'>
                      {item.title}
                    </div>
                    <p className='text-muted-foreground line-clamp-3 text-xs leading-5'>
                      {item.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          {tab === 'mine' &&
          !mineQuery.isLoading &&
          (mineQuery.data?.items || []).length === 0 ? (
            <Empty description={t('No submissions yet')} />
          ) : null}
          {tab === 'mine' ? (
            <div className='grid gap-3'>
              {(mineQuery.data?.items || []).map((item) => (
                <SubmissionCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {tab === 'review' &&
          !reviewQuery.isLoading &&
          (reviewQuery.data?.items || []).length === 0 ? (
            <Empty description={t('No submissions yet')} />
          ) : null}
          {tab === 'review' ? (
            <div className='grid gap-3'>
              {(reviewQuery.data?.items || []).map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  pending={reviewMutation.isPending}
                  onReview={(action, note) =>
                    reviewMutation.mutate({ id: item.id, action, note })
                  }
                />
              ))}
            </div>
          ) : null}
          {total > PAGE_SIZE ? (
            <div className='mt-4 flex justify-end'>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={setPage}
              />
            </div>
          ) : null}
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <Drawer
        open={submitOpen}
        title={t('Submit a prompt')}
        size={480}
        onClose={() => setSubmitOpen(false)}
        footer={
          <div className='flex justify-end gap-2'>
            <Button onClick={() => setSubmitOpen(false)}>{t('Cancel')}</Button>
            <Button
              type='primary'
              loading={submitMutation.isPending || coverUploading}
              onClick={() => {
                void form.validateFields().then((values) => {
                  submitMutation.mutate({
                    title: values.title,
                    prompt: values.prompt,
                    description: values.description,
                    cover_url: values.cover_url,
                    tags: values.tags || [],
                  })
                })
              }}
            >
              {t('Submit a prompt')}
            </Button>
          </div>
        }
      >
        <Form form={form} layout='vertical'>
          <Form.Item
            name='title'
            label={t('Title')}
            rules={[{ required: true }]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name='prompt'
            label={t('Prompt')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name='description' label={t('Description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name='tags' label={t('Tags')}>
            <TagInput placeholder={t('Type a tag and press Enter')} />
          </Form.Item>
          <Form.Item name='cover_url' hidden>
            <Input />
          </Form.Item>
          <Form.Item label={t('Cover')}>
            <Upload
              accept='image/*'
              className='[&_.ant-upload]:block [&_.ant-upload]:w-full'
              showUploadList={false}
              disabled={coverUploading}
              beforeUpload={(file) => {
                void uploadCover(file)
                return false
              }}
            >
              <button
                type='button'
                className='bg-muted hover:border-primary/40 flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed'
              >
                {coverUrl ? (
                  <SmartImage
                    src={coverUrl}
                    alt=''
                    referrerPolicy='no-referrer'
                    className='size-full object-cover' />
                ) : (
                  <span className='text-muted-foreground flex items-center gap-2 text-sm'>
                    <ImagePlus className='size-4' />
                    {coverUploading ? t('Uploading') : t('Upload cover')}
                  </span>
                )}
              </button>
            </Upload>
            <div className='mt-2 flex flex-wrap gap-2'>
              <Button
                size='small'
                icon={<Sparkles className='size-3.5' />}
                onClick={() => {
                  setCoverGenPrompt(form.getFieldValue('prompt') || '')
                  setCoverGenOpen(true)
                }}
              >
                {t('Generate cover')}
              </Button>
              {coverUrl ? (
                <Button
                  size='small'
                  icon={<X className='size-3.5' />}
                  onClick={() => form.setFieldValue('cover_url', undefined)}
                >
                  {t('Remove')}
                </Button>
              ) : null}
            </div>
          </Form.Item>
        </Form>
        <CoverGenerateDialog
          open={coverGenOpen}
          defaultPrompt={coverGenPrompt}
          uploadPurpose='prompt-cover'
          onCancel={() => setCoverGenOpen(false)}
          onGenerated={(url) => {
            form.setFieldValue('cover_url', url)
            setCoverGenOpen(false)
          }}
        />
      </Drawer>

      <Drawer
        open={detail != null}
        title={detail?.title}
        size='large'
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div className='space-y-3'>
            <div className='flex flex-wrap gap-1.5'>
              {detail.category ? <Tag>{detail.category}</Tag> : null}
              {(detail.tags || []).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
            {detail.description ? (
              <p className='text-sm'>{detail.description}</p>
            ) : null}
            <pre className='bg-muted rounded-lg p-3 text-sm leading-6 whitespace-pre-wrap'>
              {detail.prompt}
            </pre>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(detail.prompt).then(
                  () => toast.success(t('Copied')),
                  () => toast.error(t('Copy failed'))
                )
              }}
            >
              {t('Copy')}
            </Button>
          </div>
        ) : null}
      </Drawer>
    </>
  )
}

function ReviewCard({
  item,
  pending,
  onReview,
}: {
  item: PromptSubmission
  pending: boolean
  onReview: (action: 'approve' | 'reject', note: string) => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  return (
    <article className='rounded-lg border p-3'>
      <SubmissionBody item={item} />
      <Input.TextArea
        className='mt-3'
        rows={2}
        placeholder={t('Review note')}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className='mt-2 flex gap-2'>
        <Button
          type='primary'
          loading={pending}
          onClick={() => onReview('approve', note)}
        >
          {t('Approve')}
        </Button>
        <Button
          danger
          loading={pending}
          onClick={() => onReview('reject', note)}
        >
          {t('Reject')}
        </Button>
      </div>
    </article>
  )
}

function SubmissionCard({ item }: { item: PromptSubmission }) {
  return (
    <article className='rounded-lg border p-3'>
      <SubmissionBody item={item} />
    </article>
  )
}

function SubmissionBody({ item }: { item: PromptSubmission }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-sm font-medium'>{item.title}</span>
        <Tag color={statusColor(item.status)} className='m-0'>
          {t(statusLabel(item.status))}
        </Tag>
        {item.username ? (
          <span className='text-muted-foreground text-xs'>{item.username}</span>
        ) : null}
        <span className='text-muted-foreground text-xs'>
          {formatTimestampToDate(item.created_time)}
        </span>
      </div>
      <p className='text-muted-foreground line-clamp-4 text-sm leading-6'>
        {item.prompt}
      </p>
      {item.review_note ? (
        <p className='text-xs text-red-500'>{item.review_note}</p>
      ) : null}
    </div>
  )
}
