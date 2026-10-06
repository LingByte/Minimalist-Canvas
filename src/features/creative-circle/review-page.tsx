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
import { Button, Skeleton, Tag } from 'antd'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout'

import {
  listCircleReviewQueue,
  reviewCirclePost,
} from './api'
import { CircleEmpty } from './empty-illustration'
import { circleCoverUrl, CoverStill } from './cover'
import { circleAuthorLabel } from './helpers'

export function CreativeCircleReviewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const queueQuery = useInfiniteQuery({
    queryKey: ['creative-circle', 'review'],
    queryFn: ({ pageParam }) =>
      listCircleReviewQueue({
        cursor: pageParam || undefined,
        status: 'pending',
        limit: 24,
      }),
    initialPageParam: '',
    getNextPageParam: (last) =>
      last.has_more ? last.next_cursor || undefined : undefined,
  })

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: number
      action: 'approve' | 'reject'
    }) => reviewCirclePost(id, action),
    onSuccess: (_data, vars) => {
      toast.success(vars.action === 'approve' ? t('Approved') : t('Rejected'))
      void queryClient.invalidateQueries({ queryKey: ['creative-circle'] })
    },
    onError: (err: Error) => toast.error(err.message || t('Review failed')),
  })

  const posts = useMemo(
    () => queueQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [queueQuery.data]
  )

  return (
    <Main className='bg-background overflow-y-auto'>
      <div className='mx-auto w-full max-w-[1200px] space-y-5 px-3 py-4 sm:px-5 sm:py-6'>
        <header>
          <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
            {t('Creative Circle review')}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Approve or reject submissions before they appear in the feed.')}
          </p>
        </header>

        {queueQuery.isError ? (
          <ErrorState
            title={t('Failed to load Creative Circle')}
            description={(queueQuery.error as Error)?.message}
            onRetry={() => void queueQuery.refetch()}
          />
        ) : queueQuery.isLoading ? (
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
            <CircleEmpty description={t('No posts awaiting review')} />
          </div>
        ) : (
          <>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
              {posts.map((post) => (
                <article
                  key={post.id}
                  className='border-border/50 bg-card overflow-hidden rounded-xl border'
                >
                  <button
                    type='button'
                    onClick={() =>
                      void navigate({
                        to: '/creative-circle/$postId',
                        params: { postId: String(post.id) },
                      })
                    }
                    className='relative block aspect-[3/4] w-full overflow-hidden bg-black'
                  >
                    <CoverStill
                      src={circleCoverUrl(post)}
                      className='size-full object-cover'
                    />
                    <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent' />
                    <div className='absolute top-2 left-2'>
                      <Tag color='gold' className='m-0'>
                        {t('Pending review')}
                      </Tag>
                    </div>
                    <div className='absolute inset-x-0 bottom-0 space-y-1 p-2.5 text-left'>
                      <div className='truncate text-sm font-semibold text-white'>
                        {post.title || t('Untitled')}
                      </div>
                      <div className='truncate text-[11px] text-white/70'>
                        {circleAuthorLabel(post)}
                      </div>
                    </div>
                  </button>
                  <div className='flex flex-wrap gap-1 px-2 py-1.5'>
                    <Button
                      size='small'
                      type='primary'
                      loading={reviewMutation.isPending}
                      onClick={() =>
                        reviewMutation.mutate({ id: post.id, action: 'approve' })
                      }
                    >
                      {t('Approve')}
                    </Button>
                    <Button
                      size='small'
                      danger
                      loading={reviewMutation.isPending}
                      onClick={() =>
                        reviewMutation.mutate({ id: post.id, action: 'reject' })
                      }
                    >
                      {t('Reject')}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            {queueQuery.hasNextPage ? (
              <div className='flex justify-center pt-2'>
                <Button
                  loading={queueQuery.isFetchingNextPage}
                  onClick={() => void queueQuery.fetchNextPage()}
                >
                  {t('Load more')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Main>
  )
}
