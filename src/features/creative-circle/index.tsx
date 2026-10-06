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
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Button, Drawer, Segmented, Skeleton, Tag } from 'antd'
import {
  Bookmark,
  Heart,
  MessageCircle,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout'
import {
  listMyGenerationRecords,
  type GenerationRecord,
} from '@/features/generation-records/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  canRemakeCirclePost,
  fetchCircleRemakePayload,
  listCircleFeed,
  listMyCirclePosts,
  publishCirclePost,
  storeCircleRemake,
  toggleCircleReaction,
  type CirclePost,
} from './api'
import { CircleEmpty } from './empty-illustration'
import {
  CoverStill,
  circleCoverUrl,
  recordStillUrl,
  resolveCirclePublishCover,
} from './cover'
import {
  circleAuthorLabel,
  circleStatusColor,
  circleStatusLabel,
} from './helpers'

type KindFilter = 'all' | 'image' | 'video'
type SortFilter = 'latest' | 'hot'
type PageTab = 'feed' | 'mine'

function authorLabel(post: CirclePost) {
  return circleAuthorLabel(post)
}

export function CreativeCirclePage({
  initialTab,
}: {
  initialTab?: PageTab
} = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.auth.user?.id)
  const isAuthed = Boolean(currentUserId)
  const [kind, setKind] = useState<KindFilter>('all')
  const [sort, setSort] = useState<SortFilter>('latest')
  const [pageTab, setPageTab] = useState<PageTab>(initialTab || 'feed')
  const [publishOpen, setPublishOpen] = useState(false)

  useEffect(() => {
    if (initialTab) setPageTab(initialTab)
  }, [initialTab])

  const feedQuery = useInfiniteQuery({
    queryKey: ['creative-circle', 'feed', kind, sort],
    queryFn: ({ pageParam }) =>
      listCircleFeed({
        cursor: pageParam || undefined,
        kind: kind === 'all' ? undefined : kind,
        sort,
        limit: 24,
      }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.has_more ? last.next_cursor || undefined : undefined,
    enabled: pageTab === 'feed',
  })

  const mineQuery = useInfiniteQuery({
    queryKey: ['creative-circle', 'mine'],
    queryFn: ({ pageParam }) =>
      listMyCirclePosts({ cursor: pageParam || undefined, limit: 24 }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.has_more ? last.next_cursor || undefined : undefined,
    enabled: pageTab === 'mine' && isAuthed,
  })

  const activeQuery = pageTab === 'mine' ? mineQuery : feedQuery

  const posts = useMemo(
    () => activeQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [activeQuery.data]
  )

  const publishCandidatesQuery = useQuery({
    queryKey: ['creative-circle', 'publish-candidates'],
    queryFn: () =>
      listMyGenerationRecords({ limit: 30, status: 'success' }),
    enabled: publishOpen && isAuthed,
  })

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['creative-circle'] })
  }

  const reactionMutation = useMutation({
    mutationFn: ({
      id,
      type,
    }: {
      id: number
      type: 'like' | 'favorite'
    }) => toggleCircleReaction(id, type),
    onSuccess: (data, variables) => {
      invalidateAll()
      if (variables.type === 'like') {
        toast.success(data.liked ? t('Liked') : t('Like removed'))
        return
      }
      toast.success(
        data.favorited ? t('Added to favorites') : t('Removed from favorites')
      )
    },
    onError: (err: Error) => toast.error(err.message || t('Action failed')),
  })

  const publishMutation = useMutation({
    mutationFn: async ({
      record,
      coverFile,
    }: {
      record: GenerationRecord
      coverFile?: File | null
    }) => {
      const cover = await resolveCirclePublishCover(record, coverFile)
      if (record.kind === 'video' && !cover) {
        throw new Error('Add a cover image before publishing')
      }
      return publishCirclePost({
        generation_asset_id: record.id,
        cover_url: cover,
      })
    },
    onSuccess: (post) => {
      toast.success(
        post.status === 'pending'
          ? t('Submitted for review — only you can see it until approved')
          : t('Published to Creative Circle')
      )
      setPublishOpen(false)
      setPageTab('mine')
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message || t('Publish failed')),
  })

  const remakeMutation = useMutation({
    mutationFn: (id: number) => fetchCircleRemakePayload(id),
    onSuccess: (payload) => {
      storeCircleRemake(payload)
      window.location.href =
        payload.kind === 'video' ? '/canvas/video' : '/canvas/image'
    },
    onError: (err: Error) => toast.error(err.message || t('Remake failed')),
  })

  const openPost = (id: number) => {
    void navigate({
      to: '/creative-circle/$postId',
      params: { postId: String(id) },
    })
  }

  return (
    <Main className='bg-background overflow-y-auto'>
      <div className='mx-auto w-full max-w-[1200px] space-y-5 px-3 py-4 sm:px-5 sm:py-6'>
        <header className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
              {t('Creative Circle')}
            </h1>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Share generations, collect inspiration, and remake with one click'
              )}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Segmented
              value={pageTab}
              onChange={(value) => setPageTab(value as PageTab)}
              options={[
                { label: t('Feed'), value: 'feed' },
                ...(isAuthed
                  ? [{ label: t('My posts'), value: 'mine' as const }]
                  : []),
              ]}
            />
            {pageTab === 'feed' ? (
              <>
                <Segmented
                  value={sort}
                  onChange={(value) => setSort(value as SortFilter)}
                  options={[
                    { label: t('Latest'), value: 'latest' },
                    { label: t('Hot'), value: 'hot' },
                  ]}
                />
                <Segmented
                  value={kind}
                  onChange={(value) => setKind(value as KindFilter)}
                  options={[
                    { label: t('All'), value: 'all' },
                    { label: t('Image'), value: 'image' },
                    { label: t('Video'), value: 'video' },
                  ]}
                />
              </>
            ) : null}
            {isAuthed ? (
              <Button
                type='primary'
                icon={<Plus className='size-3.5' />}
                onClick={() => setPublishOpen(true)}
              >
                {t('Publish')}
              </Button>
            ) : null}
          </div>
        </header>

        {activeQuery.isError ? (
          <ErrorState
            title={t('Failed to load Creative Circle')}
            description={(activeQuery.error as Error)?.message}
            onRetry={() => void activeQuery.refetch()}
          />
        ) : activeQuery.isLoading ? (
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className='border-border/50 overflow-hidden rounded-xl border'
              >
                <Skeleton.Node active style={{ width: '100%', height: 220 }}>
                  <div />
                </Skeleton.Node>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className='flex min-h-[14rem] items-center justify-center px-4 py-8'>
            <CircleEmpty
              description={
                pageTab === 'mine'
                  ? t('You have not submitted any posts yet')
                  : t('No posts yet — be the first to publish')
              }
            />
          </div>
        ) : (
          <>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  showStatus={pageTab !== 'feed'}
                  onOpen={() => openPost(post.id)}
                  onLike={() => {
                    if (!isAuthed) {
                      toast.message(t('Sign in to like posts'))
                      return
                    }
                    reactionMutation.mutate({ id: post.id, type: 'like' })
                  }}
                  onFavorite={() => {
                    if (!isAuthed) {
                      toast.message(t('Sign in to save posts'))
                      return
                    }
                    reactionMutation.mutate({ id: post.id, type: 'favorite' })
                  }}
                  onRemake={() => {
                    if (!isAuthed) {
                      toast.message(t('Sign in to remake'))
                      return
                    }
                    remakeMutation.mutate(post.id)
                  }}
                  canRemake={canRemakeCirclePost(post)}
                />
              ))}
            </div>
            {activeQuery.hasNextPage ? (
              <div className='flex justify-center pt-2'>
                <Button
                  loading={activeQuery.isFetchingNextPage}
                  onClick={() => void activeQuery.fetchNextPage()}
                >
                  {t('Load more')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Drawer
        title={t('Publish to Creative Circle')}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        width={420}
      >
        <p className='text-muted-foreground mb-3 text-sm'>
          {t(
            'Pick a successful generation. Submissions stay private until an admin approves them.'
          )}
        </p>
        {publishCandidatesQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (publishCandidatesQuery.data?.items || []).length === 0 ? (
          <CircleEmpty
            description={t('No successful generations to publish')}
            size={72}
          />
        ) : (
          <div className='space-y-2'>
            {(publishCandidatesQuery.data?.items || []).map((record) => (
              <PublishCandidate
                key={record.id}
                record={record}
                loading={publishMutation.isPending}
                onPublish={(coverFile) =>
                  publishMutation.mutate({ record, coverFile })
                }
              />
            ))}
          </div>
        )}
      </Drawer>
    </Main>
  )
}

function PostCard(props: {
  post: CirclePost
  showStatus?: boolean
  onOpen: () => void
  onLike: () => void
  onFavorite: () => void
  onRemake: () => void
  canRemake?: boolean
}) {
  const { t } = useTranslation()
  const { post } = props

  return (
    <article className='border-border/50 bg-card group overflow-hidden rounded-xl border [content-visibility:auto]'>
      <button
        type='button'
        onClick={props.onOpen}
        className='relative block aspect-[3/4] w-full overflow-hidden bg-black'
      >
        <CoverStill
          src={circleCoverUrl(post)}
          className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]'
        />
        <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent' />
        {props.showStatus && post.status ? (
          <div className='absolute top-2 left-2'>
            <Tag color={circleStatusColor(post.status)} className='m-0'>
              {circleStatusLabel(post.status, t)}
            </Tag>
          </div>
        ) : null}
        <div className='absolute inset-x-0 bottom-0 space-y-1 p-2.5 text-left'>
          <div className='truncate text-sm font-semibold text-white'>
            {post.title || t('Untitled')}
          </div>
          <div className='truncate text-[11px] text-white/70'>
            {authorLabel(post)}
          </div>
        </div>
      </button>
      <div className='flex items-center justify-between gap-1 px-2 py-1.5'>
        <div className='flex items-center gap-0.5'>
          <button
            type='button'
            className={cn(
              'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs',
              post.liked && 'text-rose-500'
            )}
            onClick={props.onLike}
          >
            <Heart className={cn('size-3.5', post.liked && 'fill-current')} />
            {post.like_count}
          </button>
          <button
            type='button'
            className={cn(
              'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs',
              post.favorited && 'text-amber-500'
            )}
            onClick={props.onFavorite}
          >
            <Bookmark
              className={cn('size-3.5', post.favorited && 'fill-current')}
            />
            {post.favorite_count}
          </button>
          <span className='text-muted-foreground inline-flex items-center gap-1 px-1.5 text-xs'>
            <MessageCircle className='size-3.5' />
            {post.comment_count}
          </span>
        </div>
        {props.canRemake ? (
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs'
            onClick={props.onRemake}
            title={t('Make the same')}
          >
            <Sparkles className='size-3.5' />
          </button>
        ) : null}
      </div>
    </article>
  )
}

function PublishCandidate(props: {
  record: GenerationRecord
  loading?: boolean
  onPublish: (coverFile?: File | null) => void
}) {
  const { t } = useTranslation()
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const still = coverFile
    ? URL.createObjectURL(coverFile)
    : recordStillUrl(props.record)
  return (
    <div className='border-border/60 flex items-center gap-3 rounded-lg border p-2'>
      <div className='bg-muted size-14 shrink-0 overflow-hidden rounded-md'>
        <CoverStill src={still} className='size-full object-cover' />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm font-medium'>
          {props.record.title || props.record.prompt || t('Untitled')}
        </div>
        <div className='text-muted-foreground truncate text-xs'>
          {props.record.kind} · {props.record.model}
        </div>
        <label className='text-muted-foreground mt-1 inline-flex cursor-pointer text-xs underline'>
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
      </div>
      <Button
        size='small'
        type='primary'
        loading={props.loading}
        onClick={() => props.onPublish(coverFile)}
      >
        {t('Submit')}
      </Button>
    </div>
  )
}
