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
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Skeleton } from 'antd'
import { Bookmark, Heart, MessageCircle, Sparkles, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  fetchCircleRemakePayload,
  listCircleFeed,
  listMyCirclePosts,
  listMyCircleReactions,
  storeCircleRemake,
  toggleCircleReaction,
  canRemakeCirclePost,
  type CirclePost,
} from './api'
import { CircleEmpty } from './empty-illustration'
import { circleCoverUrl, CoverStill, isVideoPost } from './cover'

function authorLabel(post: CirclePost) {
  return (
    post.author.display_name?.trim() ||
    post.author.username?.trim() ||
    `User #${post.author.id}`
  )
}

export function CirclePostCard(props: {
  post: CirclePost
  onOpen?: (post: CirclePost) => void
  onLike?: (post: CirclePost) => void
  onFavorite?: (post: CirclePost) => void
  onRemake?: (post: CirclePost) => void
}) {
  const { t } = useTranslation()
  const { post } = props
  const video = isVideoPost(post)

  return (
    <article className='border-border/50 bg-card group overflow-hidden rounded-xl border'>
      <button
        type='button'
        onClick={() => props.onOpen?.(post)}
        className='relative block aspect-[3/4] w-full overflow-hidden bg-black'
      >
        <CoverStill
          src={circleCoverUrl(post)}
          className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]'
        />
        {video ? (
          <span className='absolute top-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white'>
            {t('Video')}
          </span>
        ) : null}
        <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent' />
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
            onClick={() => props.onLike?.(post)}
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
            onClick={() => props.onFavorite?.(post)}
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
        {canRemakeCirclePost(post) ? (
        <button
          type='button'
          className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs'
          onClick={() => props.onRemake?.(post)}
          title={t('Make the same')}
        >
          <Sparkles className='size-3.5' />
        </button>
        ) : null}
      </div>
    </article>
  )
}

type CircleFeedMode = 'feed' | 'liked' | 'favorited' | 'mine'

export function CirclePostGrid(props: {
  mode: CircleFeedMode
  kind?: string
  emptyDescription?: string
  onOpenPost?: (post: CirclePost) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isAuthed = Boolean(useAuthStore((s) => s.auth.user))
  const [openingId, setOpeningId] = useState<number | null>(null)

  const queryKey = ['creative-circle', props.mode, props.kind || 'all'] as const

  const feedQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => {
      if (props.mode === 'liked') {
        return listMyCircleReactions({
          type: 'like',
          cursor: pageParam || undefined,
          limit: 24,
        })
      }
      if (props.mode === 'favorited') {
        return listMyCircleReactions({
          type: 'favorite',
          cursor: pageParam || undefined,
          limit: 24,
        })
      }
      if (props.mode === 'mine') {
        return listMyCirclePosts({
          cursor: pageParam || undefined,
          limit: 24,
        })
      }
      return listCircleFeed({
        cursor: pageParam || undefined,
        kind: props.kind,
        limit: 24,
      })
    },
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.has_more ? last.next_cursor || undefined : undefined,
  })

  const posts = useMemo(
    () => feedQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [feedQuery.data]
  )

  const reactionMutation = useMutation({
    mutationFn: ({
      id,
      type,
    }: {
      id: number
      type: 'like' | 'favorite'
    }) => toggleCircleReaction(id, type),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['creative-circle'] })
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

  const remakeMutation = useMutation({
    mutationFn: (id: number) => fetchCircleRemakePayload(id),
    onSuccess: (payload) => {
      storeCircleRemake(payload)
      window.location.href =
        payload.kind === 'video' ? '/video' : '/image'
    },
    onError: (err: Error) => toast.error(err.message || t('Remake failed')),
  })

  const requireAuth = (message: string) => {
    if (isAuthed) return true
    toast.message(message)
    return false
  }

  if (feedQuery.isError) {
    return (
      <ErrorState
        title={t('Failed to load Creative Circle')}
        description={(feedQuery.error as Error)?.message}
        onRetry={() => void feedQuery.refetch()}
      />
    )
  }

  if (feedQuery.isLoading) {
    return (
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
    )
  }

  if (posts.length === 0) {
    return (
      <div className='flex min-h-[14rem] items-center justify-center px-4 py-8'>
        <CircleEmpty
          description={
            props.emptyDescription ||
            t('No posts yet — be the first to publish')
          }
        />
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
        {posts.map((post) => (
          <CirclePostCard
            key={post.id}
            post={post}
            onOpen={(item) => {
              setOpeningId(item.id)
              if (props.onOpenPost) {
                props.onOpenPost(item)
                return
              }
              void navigate(`/creative-circle/${item.id}`)
            }}
            onLike={(item) => {
              if (!requireAuth(t('Sign in to like posts'))) return
              reactionMutation.mutate({ id: item.id, type: 'like' })
            }}
            onFavorite={(item) => {
              if (!requireAuth(t('Sign in to save posts'))) return
              reactionMutation.mutate({ id: item.id, type: 'favorite' })
            }}
            onRemake={(item) => {
              if (!requireAuth(t('Sign in to remake'))) return
              remakeMutation.mutate(item.id)
            }}
          />
        ))}
      </div>
      {feedQuery.hasNextPage ? (
        <div className='flex justify-center'>
          <Button
            loading={feedQuery.isFetchingNextPage}
            onClick={() => void feedQuery.fetchNextPage()}
          >
            {t('Load more')}
          </Button>
        </div>
      ) : null}
      {openingId != null && remakeMutation.isPending ? (
        <div className='text-muted-foreground flex items-center justify-center gap-2 text-xs'>
          <Wand2 className='size-3.5 animate-pulse' />
          {t('Make the same')}
        </div>
      ) : null}
    </div>
  )
}
