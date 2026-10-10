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
import { Button, Dropdown, Input, Tag } from 'antd'
import {
  ArrowLeft,
  Bookmark,
  Flag,
  Heart,
  MoreHorizontal,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ErrorState } from '@/components/error-state'
import { UserAvatar } from '@/components/user-avatar'
import { collectAssetMediaFacts } from '@/features/generation-assets/media-details'
import { formatTimestampToDate } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  adminHideCirclePost,
  canRemakeCirclePost,
  circlePostShareUrl,
  createCircleComment,
  deleteCircleComment,
  deleteCirclePost,
  fetchCircleRemakePayload,
  getCirclePost,
  listCircleComments,
  listCircleFeed,
  reportCirclePost,
  reviewCirclePost,
  setCirclePostStatus,
  storeCircleRemake,
  toggleCircleReaction,
  updateCirclePost,
  type CircleComment,
  type CirclePost,
} from './api'
import {
  circleCoverUrl,
  circlePlaybackUrl,
  CoverStill,
  isVideoMediaUrl,
  isVideoPost,
} from './cover'
import {
  circleAuthorLabel,
  circleConfigUrls,
  circleStatusColor,
  circleStatusLabel,
} from './helpers'

type DetailTab = 'details' | 'comments'

export function CreativeCirclePostPage({ postId }: { postId: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.auth.user?.id)
  const userRole = useAuthStore((s) => s.auth.user?.role) || 0
  const isAuthed = Boolean(currentUserId)
  const isAdmin = userRole >= ROLE.ADMIN
  const [tab, setTab] = useState<DetailTab>('details')
  const [commentDraft, setCommentDraft] = useState('')
  const [replyToId, setReplyToId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const detailQuery = useQuery({
    queryKey: ['creative-circle', 'post', postId],
    queryFn: () => getCirclePost(postId),
    enabled: Number.isInteger(postId) && postId > 0,
    retry: false,
  })

  const commentsQuery = useQuery({
    queryKey: ['creative-circle', 'comments', postId],
    queryFn: () => listCircleComments(postId),
    enabled: detailQuery.isSuccess,
    retry: false,
  })

  const relatedQuery = useQuery({
    queryKey: ['creative-circle', 'related', detailQuery.data?.kind || 'all'],
    queryFn: () =>
      listCircleFeed({
        kind: detailQuery.data?.kind,
        sort: 'hot',
        limit: 24,
      }),
    enabled: detailQuery.isSuccess,
  })

  const detail = detailQuery.data

  useEffect(() => {
    if (detailQuery.data) setEditTitle(detailQuery.data.title || '')
  }, [detailQuery.data])
  const canManage =
    Boolean(detail && currentUserId != null && detail.author.id === currentUserId)

  const related = useMemo(
    () =>
      (relatedQuery.data?.items || []).filter((item) => item.id !== postId),
    [relatedQuery.data, postId]
  )

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['creative-circle'] })
  }

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    void navigate('/creative-circle')
  }

  const goPost = (id: number) => {
    void navigate(`/creative-circle/${id}`)
  }

  const reactionMutation = useMutation({
    mutationFn: (type: 'like' | 'favorite') =>
      toggleCircleReaction(postId, type),
    onSuccess: (data, type) => {
      invalidateAll()
      if (type === 'like') {
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
    mutationFn: () => fetchCircleRemakePayload(postId),
    onSuccess: (payload) => {
      storeCircleRemake(payload)
      window.location.href =
        payload.kind === 'video' ? '/video' : '/image'
    },
    onError: (err: Error) => toast.error(err.message || t('Remake failed')),
  })

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      createCircleComment(postId, body, replyToId || undefined),
    onSuccess: () => {
      setCommentDraft('')
      setReplyToId(null)
      toast.success(t('Comment posted'))
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message || t('Comment failed')),
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => deleteCircleComment(commentId),
    onSuccess: () => {
      toast.success(t('Comment deleted'))
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message || t('Delete failed')),
  })

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => updateCirclePost(postId, title),
    onSuccess: () => {
      toast.success(t('Title updated'))
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message || t('Update failed')),
  })

  const statusMutation = useMutation({
    mutationFn: (status: 'unpublished' | 'pending' | 'removed') =>
      setCirclePostStatus(postId, status),
    onSuccess: (post) => {
      let message = t('Updated')
      if (post.status === 'pending') message = t('Resubmitted for review')
      else if (post.status === 'unpublished') message = t('Post unpublished')
      toast.success(message)
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message || t('Update failed')),
  })

  const hideMutation = useMutation({
    mutationFn: () => adminHideCirclePost(postId),
    onSuccess: () => {
      toast.success(t('Post hidden'))
      void navigate('/creative-circle')
    },
    onError: (err: Error) => toast.error(err.message || t('Action failed')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCirclePost(postId),
    onSuccess: () => {
      toast.success(t('Post deleted'))
      setDeleteOpen(false)
      void navigate('/creative-circle')
    },
    onError: (err: Error) => toast.error(err.message || t('Delete failed')),
  })

  const reportMutation = useMutation({
    mutationFn: (reason: string) => reportCirclePost(postId, reason),
    onSuccess: () => {
      toast.success(t('Report submitted'))
      setReportOpen(false)
      setReportReason('')
    },
    onError: (err: Error) => toast.error(err.message || t('Report failed')),
  })

  const reviewMutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      reviewCirclePost(postId, action),
    onSuccess: (_data, action) => {
      toast.success(action === 'approve' ? t('Approved') : t('Rejected'))
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message || t('Review failed')),
  })

  const copyShareLink = async () => {
    const url = circlePostShareUrl(postId)
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('Share link copied'))
    } catch {
      toast.message(url)
    }
  }

  const requireAuth = (message: string) => {
    if (isAuthed) return true
    toast.message(message)
    void navigate(`/sign-in?redirect=${encodeURIComponent(window.location.href)}`)
    return false
  }

  if (!Number.isInteger(postId) || postId <= 0) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black'>
        <ErrorState
          title={t('This post is no longer available')}
          onRetry={() => void navigate('/creative-circle')}
        />
      </div>
    )
  }

  if (detailQuery.isError) {
    return (
      <div className='fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-6'>
        <ErrorState
          title={t('This post is no longer available')}
          description={(detailQuery.error as Error)?.message}
          onRetry={() => void detailQuery.refetch()}
        />
        <Button onClick={goBack}>{t('Back')}</Button>
      </div>
    )
  }

  return (
    <div className='fixed inset-0 z-50 flex bg-black text-zinc-100'>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row'>
        <section className='relative flex min-h-[42vh] min-w-0 flex-1 items-center justify-center bg-black lg:h-full lg:min-h-0'>
          <button
            type='button'
            onClick={goBack}
            className='absolute top-4 left-4 z-10 inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20'
            aria-label={t('Back')}
          >
            <ArrowLeft className='size-4' />
          </button>
          <PostStage
            loading={detailQuery.isLoading || !detail}
            post={detail}
          />
        </section>

        <aside className='flex max-h-[52vh] w-full shrink-0 flex-col overflow-hidden border-t border-white/10 bg-zinc-950 lg:h-full lg:max-h-none lg:w-[380px] lg:border-t-0 lg:border-l'>
          {detailQuery.isLoading || !detail ? (
            <div className='text-zinc-500 p-6 text-sm'>{t('Loading...')}</div>
          ) : (
            <PostInfoPanel
              post={detail}
              tab={tab}
              onTab={setTab}
              comments={commentsQuery.data || []}
              canManage={canManage}
              isAdmin={isAdmin}
              isAuthed={isAuthed}
              currentUserId={currentUserId}
              editTitle={editTitle}
              onEditTitle={setEditTitle}
              onSaveTitle={() => {
                const next = (editTitle || detail.title).trim()
                if (!next || next === detail.title) return
                updateTitleMutation.mutate(next)
              }}
              savingTitle={updateTitleMutation.isPending}
              commentDraft={commentDraft}
              onCommentDraft={setCommentDraft}
              replyToId={replyToId}
              onReplyTo={setReplyToId}
              onSendComment={() => {
                if (!requireAuth(t('Sign in to comment'))) return
                const body = commentDraft.trim()
                if (!body) return
                commentMutation.mutate(body)
              }}
              sendingComment={commentMutation.isPending}
              onDeleteComment={(id) => deleteCommentMutation.mutate(id)}
              onLike={() => {
                if (!requireAuth(t('Sign in to like posts'))) return
                reactionMutation.mutate('like')
              }}
              onFavorite={() => {
                if (!requireAuth(t('Sign in to save posts'))) return
                reactionMutation.mutate('favorite')
              }}
              onRemake={() => {
                if (!requireAuth(t('Sign in to remake'))) return
                remakeMutation.mutate()
              }}
              remaking={remakeMutation.isPending}
              onShare={() => void copyShareLink()}
              onUnpublish={() => statusMutation.mutate('unpublished')}
              onResubmit={() => statusMutation.mutate('pending')}
              onDelete={() => setDeleteOpen(true)}
              onHide={() => hideMutation.mutate()}
              onReport={() => setReportOpen(true)}
              reportOpen={reportOpen}
              reportReason={reportReason}
              onReportReason={setReportReason}
              onSubmitReport={() => {
                const reason = reportReason.trim()
                if (!reason) return
                reportMutation.mutate(reason)
              }}
              reporting={reportMutation.isPending}
              onApprove={() => reviewMutation.mutate('approve')}
              onReject={() => reviewMutation.mutate('reject')}
              reviewing={reviewMutation.isPending}
            />
          )}
        </aside>

        <aside className='hidden w-[88px] shrink-0 overflow-y-auto border-l border-white/10 bg-zinc-950 py-3 xl:flex xl:flex-col xl:gap-2 xl:px-2'>
          {related.map((item) => (
            <button
              key={item.id}
              type='button'
              onClick={() => goPost(item.id)}
              className={cn(
                'relative aspect-[3/4] overflow-hidden rounded-lg ring-offset-2 ring-offset-zinc-950',
                item.id === postId ? 'ring-2 ring-emerald-400' : 'hover:opacity-90'
              )}
              aria-label={item.title || t('Untitled')}
            >
              <CoverStill
                src={circleCoverUrl(item)}
                className='size-full object-cover'
              />
            </button>
          ))}
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteOpen(false)
        }}
        title={t('Delete post')}
        desc={t('Delete this post from Creative Circle?')}
        confirmText={t('Delete')}
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={() => deleteMutation.mutateAsync()}
      />
    </div>
  )
}

function PostStage(props: { loading: boolean; post?: CirclePost }) {
  const { t } = useTranslation()
  if (props.loading || !props.post) {
    return <div className='text-zinc-500 text-sm'>{t('Loading...')}</div>
  }
  if (isVideoPost(props.post)) {
    return (
      <video
        key={circlePlaybackUrl(props.post)}
        src={circlePlaybackUrl(props.post)}
        poster={circleCoverUrl(props.post) || undefined}
        controls
        autoPlay
        playsInline
        preload='metadata'
        className='max-h-full max-w-full object-contain'
      />
    )
  }
  return (
    <CoverStill
      src={circleCoverUrl(props.post)}
      className='max-h-full max-w-full object-contain'
    />
  )
}

function PostInfoPanel(props: {
  post: CirclePost
  tab: DetailTab
  onTab: (tab: DetailTab) => void
  comments: CircleComment[]
  canManage: boolean
  isAdmin: boolean
  isAuthed: boolean
  currentUserId?: number
  editTitle: string
  onEditTitle: (value: string) => void
  onSaveTitle: () => void
  savingTitle: boolean
  commentDraft: string
  onCommentDraft: (value: string) => void
  replyToId: number | null
  onReplyTo: (id: number | null) => void
  onSendComment: () => void
  sendingComment: boolean
  onDeleteComment: (id: number) => void
  onLike: () => void
  onFavorite: () => void
  onRemake: () => void
  remaking: boolean
  onShare: () => void
  onUnpublish: () => void
  onResubmit: () => void
  onDelete: () => void
  onHide: () => void
  onReport: () => void
  reportOpen: boolean
  reportReason: string
  onReportReason: (value: string) => void
  onSubmitReport: () => void
  reporting: boolean
  onApprove: () => void
  onReject: () => void
  reviewing: boolean
}) {
  const { t } = useTranslation()
  const post = props.post
  const published = post.status === 'published'
  const playFile = (post.assets || []).find(
    (file) => file.url && isVideoMediaUrl(file.url)
  )
  const facts = playFile ? collectAssetMediaFacts(playFile, t) : []
  const imageRefs = circleConfigUrls(post.config, [
    'images',
    'references',
    'input_images',
  ])
  const videoRefs = circleConfigUrls(post.config, ['videos'])
  const compactFacts = facts.filter((row) =>
    ['resolution', 'duration'].includes(row.key)
  )

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex items-start gap-3 px-5 pt-5'>
        <UserAvatar size={44} name={circleAuthorLabel(post)} />
        <div className='min-w-0 flex-1'>
          <div className='truncate text-[15px] font-semibold'>
            {circleAuthorLabel(post)}
          </div>
          <div className='text-zinc-400 mt-0.5 text-xs'>
            {t('Remakes')} {post.remake_count}
          </div>
        </div>
        {post.status && post.status !== 'published' ? (
          <Tag color={circleStatusColor(post.status)} className='m-0'>
            {circleStatusLabel(post.status, t)}
          </Tag>
        ) : null}
      </div>

      <div className='flex items-start justify-between gap-3 px-5 pt-4'>
        <div className='min-w-0'>
          <h1 className='text-[17px] leading-snug font-semibold'>
            {post.title || t('Untitled')}
          </h1>
          <p className='text-zinc-500 mt-1 text-xs'>
            {formatTimestampToDate(post.created_at)}
            {post.model ? ` · ${post.model}` : ''}
            {' · '}
            {t('Generated by AI')}
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <button
            type='button'
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm',
              post.liked ? 'text-rose-400' : 'text-zinc-300 hover:text-white'
            )}
            onClick={props.onLike}
          >
            <Heart className={cn('size-4', post.liked && 'fill-current')} />
            {post.like_count}
          </button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'share',
                  label: t('Share'),
                  onClick: props.onShare,
                },
                ...(props.canManage && published
                  ? [
                      {
                        key: 'unpublish',
                        label: t('Unpublish'),
                        onClick: props.onUnpublish,
                      },
                    ]
                  : []),
                ...(props.canManage &&
                (post.status === 'unpublished' || post.status === 'rejected')
                  ? [
                      {
                        key: 'resubmit',
                        label: t('Resubmit'),
                        onClick: props.onResubmit,
                      },
                    ]
                  : []),
                ...(props.isAuthed && !props.canManage && published
                  ? [
                      {
                        key: 'report',
                        label: t('Report'),
                        onClick: props.onReport,
                      },
                    ]
                  : []),
                ...(props.isAdmin && post.status !== 'removed'
                  ? [
                      {
                        key: 'hide',
                        label: t('Hide'),
                        danger: true,
                        onClick: props.onHide,
                      },
                    ]
                  : []),
                ...(props.canManage
                  ? [
                      {
                        key: 'delete',
                        label: t('Delete'),
                        danger: true,
                        onClick: props.onDelete,
                      },
                    ]
                  : []),
              ],
            }}
          >
            <button
              type='button'
              className='text-zinc-400 hover:text-white inline-flex size-8 items-center justify-center rounded-full'
              aria-label={t('More')}
            >
              <MoreHorizontal className='size-4' />
            </button>
          </Dropdown>
        </div>
      </div>

      <div className='mt-4 flex gap-5 border-b border-white/10 px-5'>
        <TabButton
          active={props.tab === 'details'}
          onClick={() => props.onTab('details')}
        >
          {t('Creation details')}
        </TabButton>
        <TabButton
          active={props.tab === 'comments'}
          onClick={() => props.onTab('comments')}
        >
          {t('Comments')} ({post.comment_count})
        </TabButton>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-5 py-4'>
        {props.tab === 'details' ? (
          <div className='space-y-4'>
            {props.canManage ? (
              <div className='flex gap-2'>
                <Input
                  value={props.editTitle}
                  onChange={(e) => props.onEditTitle(e.target.value)}
                  maxLength={120}
                  placeholder={t('Title')}
                />
                <Button
                  loading={props.savingTitle}
                  onClick={props.onSaveTitle}
                >
                  {t('Save')}
                </Button>
              </div>
            ) : null}
            {compactFacts.length > 0 ? (
              <div className='text-zinc-300 flex flex-wrap gap-2 text-xs'>
                {compactFacts.map((row) => (
                  <span
                    key={row.key}
                    className='rounded-md bg-white/10 px-2 py-1'
                  >
                    {row.value}
                  </span>
                ))}
              </div>
            ) : null}
            {videoRefs.length > 0 || imageRefs.length > 0 ? (
              <div className='space-y-2'>
                <div className='text-zinc-400 text-xs font-medium'>
                  {t('References')}
                </div>
                <div className='flex flex-wrap gap-2'>
                  {videoRefs.map((url) => (
                    <div
                      key={url}
                      className='size-16 overflow-hidden rounded-lg bg-black'
                    >
                      <video
                        src={url}
                        muted
                        preload='metadata'
                        className='size-full object-cover'
                      />
                    </div>
                  ))}
                  {imageRefs.map((url) => (
                    <div
                      key={url}
                      className='size-16 overflow-hidden rounded-lg bg-black'
                    >
                      <CoverStill src={url} className='size-full object-cover' />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {post.prompt ? (
              <p className='text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap'>
                {post.prompt}
              </p>
            ) : null}
            {published && canRemakeCirclePost(post) ? (
              <div className='flex gap-2'>
                <Button
                  icon={<Bookmark className={cn('size-3.5', post.favorited && 'fill-current')} />}
                  onClick={props.onFavorite}
                >
                  {post.favorite_count}
                </Button>
                <Button
                  type='primary'
                  icon={<Wand2 className='size-3.5' />}
                  loading={props.remaking}
                  onClick={props.onRemake}
                  className='flex-1'
                >
                  {t('Make the same')}
                </Button>
              </div>
            ) : null}
            {props.isAdmin && post.status === 'pending' ? (
              <div className='flex gap-2'>
                <Button
                  type='primary'
                  loading={props.reviewing}
                  onClick={props.onApprove}
                >
                  {t('Approve')}
                </Button>
                <Button
                  danger
                  loading={props.reviewing}
                  onClick={props.onReject}
                >
                  {t('Reject')}
                </Button>
              </div>
            ) : null}
            {post.status && post.status !== 'published' ? (
              <p className='text-zinc-500 text-sm'>
                {t(
                  'This post is not public yet. Only you can see it while it is under review or unpublished.'
                )}
              </p>
            ) : null}
            {props.reportOpen ? (
              <div className='space-y-2 rounded-lg border border-white/10 p-3'>
                <Input.TextArea
                  value={props.reportReason}
                  onChange={(e) => props.onReportReason(e.target.value)}
                  placeholder={t('Why are you reporting this post?')}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  maxLength={500}
                />
                <Button
                  type='primary'
                  icon={<Flag className='size-3.5' />}
                  loading={props.reporting}
                  onClick={props.onSubmitReport}
                >
                  {t('Submit report')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className='space-y-3'>
            {props.isAuthed ? (
              <div className='space-y-2'>
                {props.replyToId ? (
                  <div className='text-zinc-500 flex items-center justify-between text-xs'>
                    <span>{t('Replying to a comment')}</span>
                    <button
                      type='button'
                      className='underline'
                      onClick={() => props.onReplyTo(null)}
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                ) : null}
                <div className='flex gap-2'>
                  <Input.TextArea
                    value={props.commentDraft}
                    onChange={(e) => props.onCommentDraft(e.target.value)}
                    placeholder={t('Share your thoughts')}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    maxLength={1000}
                  />
                  <Button
                    type='primary'
                    loading={props.sendingComment}
                    onClick={props.onSendComment}
                  >
                    {t('Send')}
                  </Button>
                </div>
              </div>
            ) : null}
            {props.comments.length === 0 ? (
              <p className='text-zinc-500 text-sm'>{t('No comments yet')}</p>
            ) : (
              <ul className='space-y-3'>
                {props.comments.map((comment) => (
                  <li
                    key={comment.id}
                    className={cn(comment.parent_id ? 'ml-4' : null)}
                  >
                    <div className='flex items-center gap-2 text-xs'>
                      <span className='font-medium'>
                        {comment.author.display_name ||
                          comment.author.username}
                      </span>
                      <span className='text-zinc-500'>
                        {formatTimestampToDate(comment.created_at)}
                      </span>
                    </div>
                    <p className='mt-1 text-sm leading-relaxed whitespace-pre-wrap'>
                      {comment.body}
                    </p>
                    <div className='mt-1.5 flex gap-2'>
                      {props.isAuthed ? (
                        <button
                          type='button'
                          className='text-zinc-500 hover:text-zinc-200 text-xs underline'
                          onClick={() => props.onReplyTo(comment.id)}
                        >
                          {t('Reply')}
                        </button>
                      ) : null}
                      {props.currentUserId === comment.author.id ||
                      props.isAdmin ? (
                        <button
                          type='button'
                          className='text-xs text-rose-400 underline'
                          onClick={() => props.onDeleteComment(comment.id)}
                        >
                          {t('Delete')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton(props: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type='button'
      onClick={props.onClick}
      className={cn(
        '-mb-px border-b-2 pb-2 text-sm',
        props.active
          ? 'border-white font-medium text-white'
          : 'border-transparent text-zinc-500 hover:text-zinc-200'
      )}
    >
      {props.children}
    </button>
  )
}
