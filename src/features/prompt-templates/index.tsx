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
import { Button, Drawer, Input, Popconfirm, Switch, Table, Tag } from 'antd'
import type { TableProps } from 'antd/es/table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { SmartImage } from '@/components/smart-image'
import { cn } from '@/lib/utils'

import {
  createManagedCatalog,
  createPromptTemplate,
  deleteManagedCatalog,
  deletePromptTemplate,
  listPromptSources,
  listPromptTemplatesBySource,
  setPromptSourceEnabled,
  updateManagedCatalog,
  updatePromptTemplate,
} from './api'
import { CatalogFormDialog } from './catalog-form-dialog'
import { PROMPT_COVER_PLACEHOLDER } from './constants'
import { TemplateFormDialog } from './template-form-dialog'
import type {
  PromptSourceItem,
  PromptTemplateInput,
  PromptTemplateItem,
} from './types'
import { canDeleteCatalog, canEditCatalogMeta } from './types'

const PAGE_SIZE = 20

function templateRowKey(row: PromptTemplateItem) {
  return `${row.sourceId}:${row.id}`
}

export function PromptTemplates() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [sourceKeyword, setSourceKeyword] = useState('')
  const [templateKeyword, setTemplateKeyword] = useState('')
  const [debouncedTemplateKeyword, setDebouncedTemplateKeyword] = useState('')
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [detail, setDetail] = useState<PromptTemplateItem | null>(null)
  const [catalogDialog, setCatalogDialog] = useState<{
    open: boolean
    initial?: PromptSourceItem | null
  }>({ open: false })
  const [templateDialog, setTemplateDialog] = useState<{
    open: boolean
    initial?: PromptTemplateItem | null
  }>({ open: false })
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([])

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedTemplateKeyword(templateKeyword),
      300
    )
    return () => clearTimeout(timer)
  }, [templateKeyword])

  const sourcesQuery = useQuery({
    queryKey: ['prompt-templates', 'sources'],
    queryFn: listPromptSources,
  })

  const sources = useMemo(() => {
    const list = sourcesQuery.data ?? []
    const q = sourceKeyword.trim().toLowerCase()
    if (!q) return list
    return list.filter((item) => {
      const id = (item.id || '').toLowerCase()
      return (
        item.name.toLowerCase().includes(q) ||
        id.includes(q) ||
        item.url.toLowerCase().includes(q)
      )
    })
  }, [sourcesQuery.data, sourceKeyword])

  useEffect(() => {
    if (!sources.length) {
      setSelectedSourceId('')
      return
    }
    if (!selectedSourceId || !sources.some((s) => s.id === selectedSourceId)) {
      setSelectedSourceId(sources[0].id)
    }
  }, [sources, selectedSourceId])

  useEffect(() => {
    setSelectedTemplateKeys([])
  }, [selectedSourceId, debouncedTemplateKeyword])

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedSourceId) || null,
    [sources, selectedSourceId]
  )

  const templatesQuery = useInfiniteQuery({
    queryKey: [
      'prompt-templates',
      'items',
      selectedSourceId,
      debouncedTemplateKeyword,
    ],
    queryFn: ({ pageParam }) =>
      listPromptTemplatesBySource({
        sourceId: selectedSourceId,
        keyword: debouncedTemplateKeyword,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(selectedSourceId),
  })

  const templates = useMemo(
    () => templatesQuery.data?.pages.flatMap((page) => page.items) || [],
    [templatesQuery.data?.pages]
  )
  const totalTemplates = templatesQuery.data?.pages[0]?.total ?? 0

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['prompt-templates'] })
  }

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setPromptSourceEnabled(id, enabled),
    onSuccess: invalidateAll,
    onError: (err: Error) =>
      toast.error(err.message || t('Failed to update prompt source')),
  })

  const catalogMutation = useMutation({
    mutationFn: async (values: { name: string; homepage?: string }) => {
      if (catalogDialog.initial?.id) {
        return updateManagedCatalog(catalogDialog.initial.id, values)
      }
      return createManagedCatalog(values)
    },
    onSuccess: (item) => {
      toast.success(
        catalogDialog.initial ? t('Catalog updated') : t('Catalog created')
      )
      setCatalogDialog({ open: false })
      invalidateAll()
      if (item?.id) setSelectedSourceId(item.id)
    },
    onError: (err: Error) =>
      toast.error(err.message || t('Failed to save catalog')),
  })

  const deleteCatalogMutation = useMutation({
    mutationFn: (id: string) => deleteManagedCatalog(id),
    onSuccess: () => {
      toast.success(t('Catalog deleted'))
      invalidateAll()
    },
    onError: (err: Error) =>
      toast.error(err.message || t('Failed to delete catalog')),
  })

  const templateMutation = useMutation({
    mutationFn: async (values: PromptTemplateInput) => {
      if (!selectedSourceId) throw new Error(t('Select a source'))
      if (templateDialog.initial?.id) {
        return updatePromptTemplate(
          selectedSourceId,
          templateDialog.initial.id,
          values
        )
      }
      return createPromptTemplate(selectedSourceId, values)
    },
    onSuccess: () => {
      toast.success(
        templateDialog.initial ? t('Template updated') : t('Template created')
      )
      setTemplateDialog({ open: false })
      invalidateAll()
    },
    onError: (err: Error) =>
      toast.error(err.message || t('Failed to save template')),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: (item: PromptTemplateItem) =>
      deletePromptTemplate(item.sourceId || selectedSourceId, item.id),
    onSuccess: () => {
      toast.success(t('Template deleted'))
      setDetail(null)
      invalidateAll()
    },
    onError: (err: Error) =>
      toast.error(err.message || t('Failed to delete template')),
  })

  const batchDeleteTemplatesMutation = useMutation({
    mutationFn: async (items: PromptTemplateItem[]) => {
      const results = await Promise.allSettled(
        items.map((item) =>
          deletePromptTemplate(item.sourceId || selectedSourceId, item.id)
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed
      if (failed > 0) {
        throw new Error(
          t('Deleted {{ok}} templates, {{failed}} failed', {
            ok: succeeded,
            failed,
          })
        )
      }
      return succeeded
    },
    onSuccess: (count) => {
      toast.success(t('Deleted {{count}} templates', { count }))
      setSelectedTemplateKeys([])
      setDetail(null)
      invalidateAll()
    },
    onError: (err: Error) =>
      toast.error(err.message || t('Failed to delete templates')),
  })

  const selectedTemplates = useMemo(
    () =>
      templates.filter((row) =>
        selectedTemplateKeys.includes(templateRowKey(row))
      ),
    [templates, selectedTemplateKeys]
  )

  const rowSelection: TableProps<PromptTemplateItem>['rowSelection'] = {
    selectedRowKeys: selectedTemplateKeys,
    onChange: (keys) => setSelectedTemplateKeys(keys.map(String)),
  }

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Prompt Templates')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col'>
          <div className='text-muted-foreground mb-4 shrink-0 space-y-1 text-sm'>
            <p>
              {t(
                'Manage catalogs on the left and templates on the right. You can add, edit, or delete templates and images.'
              )}
            </p>
          </div>

          <div className='grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]'>
            <aside className='border-border flex min-h-0 flex-col overflow-hidden rounded-lg border'>
              <div className='border-border space-y-2 border-b p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <div className='text-sm font-medium'>{t('Catalogs')}</div>
                  <Button
                    type='primary'
                    size='small'
                    icon={<Plus className='size-3.5' />}
                    onClick={() =>
                      setCatalogDialog({ open: true, initial: null })
                    }
                  >
                    {t('Add')}
                  </Button>
                </div>
                <Input
                  value={sourceKeyword}
                  onChange={(e) => setSourceKeyword(e.target.value)}
                  placeholder={t('Search catalogs')}
                  allowClear
                />
              </div>
              <div className='min-h-0 flex-1 overflow-auto p-2'>
                {sourcesQuery.isLoading ? (
                  <div className='text-muted-foreground px-2 py-6 text-center text-sm'>
                    {t('Loading...')}
                  </div>
                ) : sources.length === 0 ? (
                  <div className='text-muted-foreground px-2 py-6 text-center text-sm'>
                    {t('No prompt sources found')}
                  </div>
                ) : (
                  <div className='space-y-1'>
                    {sources.map((source) => (
                      <SourceListItem
                        key={source.id || source.url}
                        source={source}
                        active={source.id === selectedSourceId}
                        toggling={
                          toggleMutation.isPending &&
                          toggleMutation.variables?.id === source.id
                        }
                        deleting={
                          deleteCatalogMutation.isPending &&
                          deleteCatalogMutation.variables === source.id
                        }
                        onSelect={() => setSelectedSourceId(source.id)}
                        onToggle={(enabled) => {
                          if (!source.id) return
                          toggleMutation.mutate({ id: source.id, enabled })
                        }}
                        onEdit={() =>
                          setCatalogDialog({ open: true, initial: source })
                        }
                        onDelete={() => {
                          if (!source.id) return
                          deleteCatalogMutation.mutate(source.id)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <section className='border-border flex min-h-0 flex-col overflow-hidden rounded-lg border'>
              <div className='border-border space-y-3 border-b p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='truncate text-sm font-medium'>
                      {selectedSource?.name || t('Select a source')}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      {selectedSource
                        ? t('{{count}} templates', { count: totalTemplates })
                        : t('Choose a catalog on the left to list templates')}
                    </div>
                  </div>
                  <Popconfirm
                    title={t('Delete {{count}} selected templates?', {
                      count: selectedTemplates.length,
                    })}
                    okText={t('Delete')}
                    cancelText={t('Cancel')}
                    okButtonProps={{ danger: true }}
                    disabled={selectedTemplates.length === 0}
                    onConfirm={() =>
                      batchDeleteTemplatesMutation.mutate(selectedTemplates)
                    }
                  >
                    <Button
                      danger
                      icon={<Trash2 className='size-3.5' />}
                      disabled={
                        selectedTemplates.length === 0 || !selectedSourceId
                      }
                      loading={batchDeleteTemplatesMutation.isPending}
                    >
                      {t('Delete selected ({{count}})', {
                        count: selectedTemplates.length,
                      })}
                    </Button>
                  </Popconfirm>
                </div>
                <div className='flex items-center gap-2'>
                  <Input
                    value={templateKeyword}
                    onChange={(e) => setTemplateKeyword(e.target.value)}
                    placeholder={t('Search templates')}
                    className='min-w-0 flex-1'
                    allowClear
                    disabled={!selectedSourceId}
                  />
                  <Button
                    type='primary'
                    className='shrink-0'
                    icon={<Plus className='size-3.5' />}
                    disabled={!selectedSourceId}
                    onClick={() =>
                      setTemplateDialog({ open: true, initial: null })
                    }
                  >
                    {t('Add template')}
                  </Button>
                </div>
              </div>

              <div className='min-h-0 flex-1 overflow-auto p-3'>
                <Table
                  rowKey={templateRowKey}
                  rowSelection={rowSelection}
                  loading={
                    templatesQuery.isLoading ||
                    (templatesQuery.isFetching && templates.length === 0)
                  }
                  dataSource={templates}
                  pagination={false}
                  locale={{
                    emptyText: !selectedSourceId
                      ? t('Select a source')
                      : t('No prompt templates found'),
                  }}
                  columns={[
                    {
                      title: t('Cover'),
                      dataIndex: 'coverUrl',
                      width: 72,
                      render: (coverUrl: string) => (
                        <SmartImage
                          src={coverUrl || PROMPT_COVER_PLACEHOLDER}
                          alt=''
                          className='size-12 rounded object-cover' />
                      ),
                    },
                    {
                      title: t('Title'),
                      dataIndex: 'title',
                      render: (title: string, row: PromptTemplateItem) => (
                        <div className='space-y-1'>
                          <div className='font-medium'>{title}</div>
                          <div className='text-muted-foreground line-clamp-2 text-xs'>
                            {row.prompt}
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: t('Tags'),
                      dataIndex: 'tags',
                      width: 180,
                      render: (tags: string[]) => (
                        <div className='flex flex-wrap gap-1'>
                          {(tags || []).slice(0, 3).map((tag) => (
                            <Tag key={tag} className='m-0'>
                              {tag}
                            </Tag>
                          ))}
                        </div>
                      ),
                    },
                    {
                      title: t('Actions'),
                      key: 'actions',
                      width: 200,
                      render: (_: unknown, row: PromptTemplateItem) => (
                        <div className='flex flex-wrap gap-1'>
                          <Button
                            type='link'
                            size='small'
                            onClick={() => setDetail(row)}
                          >
                            {t('Details')}
                          </Button>
                          <Button
                            type='link'
                            size='small'
                            onClick={() =>
                              setTemplateDialog({ open: true, initial: row })
                            }
                          >
                            {t('Edit')}
                          </Button>
                          <Popconfirm
                            title={t('Delete this template?')}
                            okText={t('Delete')}
                            cancelText={t('Cancel')}
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deleteTemplateMutation.mutate(row)}
                          >
                            <Button type='link' size='small' danger>
                              {t('Delete')}
                            </Button>
                          </Popconfirm>
                        </div>
                      ),
                    },
                  ]}
                />

                {templatesQuery.hasNextPage ? (
                  <div className='flex justify-center pt-4'>
                    <Button
                      loading={templatesQuery.isFetchingNextPage}
                      onClick={() => void templatesQuery.fetchNextPage()}
                    >
                      {t('View more')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <TemplateDetailDrawer
          item={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            if (!detail) return
            setTemplateDialog({ open: true, initial: detail })
            setDetail(null)
          }}
          onDelete={() => {
            if (!detail) return
            deleteTemplateMutation.mutate(detail)
          }}
        />

        <CatalogFormDialog
          open={catalogDialog.open}
          initial={catalogDialog.initial}
          confirming={catalogMutation.isPending}
          onCancel={() => setCatalogDialog({ open: false })}
          onSubmit={(values) => catalogMutation.mutate(values)}
        />

        <TemplateFormDialog
          open={templateDialog.open}
          initial={templateDialog.initial}
          confirming={templateMutation.isPending}
          onCancel={() => setTemplateDialog({ open: false })}
          onSubmit={(values) => templateMutation.mutate(values)}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function SourceListItem({
  source,
  active,
  toggling,
  deleting,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
}: {
  source: PromptSourceItem
  active: boolean
  toggling: boolean
  deleting: boolean
  onSelect: () => void
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'hover:bg-muted/60 flex w-full items-start gap-2 rounded-md px-2 py-2 transition',
        active && 'bg-muted'
      )}
    >
      <button
        type='button'
        onClick={onSelect}
        className='min-w-0 flex-1 text-left'
      >
        <div className='truncate text-sm font-medium'>{source.name}</div>
        <div className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs'>
          <span>{source.prompt_count ?? 0}</span>
          {source.builtIn ? <Tag className='m-0'>{t('Built-in')}</Tag> : null}
          {source.last_error ? (
            <span
              className='text-destructive line-clamp-1'
              title={source.last_error}
            >
              {t('Sync error')}
            </span>
          ) : null}
        </div>
      </button>
      <div className='flex shrink-0 items-center gap-1 pt-0.5'>
        {canEditCatalogMeta(source) ? (
          <Button
            type='text'
            size='small'
            icon={<Pencil className='size-3.5' />}
            onClick={onEdit}
            aria-label={t('Edit')}
          />
        ) : null}
        {canDeleteCatalog(source) ? (
          <Popconfirm
            title={t('Delete this catalog and all its templates?')}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={onDelete}
          >
            <Button
              type='text'
              size='small'
              danger
              loading={deleting}
              icon={<Trash2 className='size-3.5' />}
              aria-label={t('Delete')}
            />
          </Popconfirm>
        ) : null}
        <Switch
          size='small'
          checked={source.enabled}
          disabled={!source.id}
          loading={toggling}
          onChange={onToggle}
        />
      </div>
    </div>
  )
}

function TemplateDetailDrawer({
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  item: PromptTemplateItem | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <Drawer
      title={item?.title || t('Template details')}
      open={Boolean(item)}
      onClose={onClose}
      width={560}
      destroyOnClose
      extra={
        item ? (
          <div className='flex gap-2'>
            <Button size='small' onClick={onEdit}>
              {t('Edit')}
            </Button>
            <Popconfirm
              title={t('Delete this template?')}
              okText={t('Delete')}
              cancelText={t('Cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
            >
              <Button size='small' danger>
                {t('Delete')}
              </Button>
            </Popconfirm>
          </div>
        ) : null
      }
    >
      {item ? (
        <div className='space-y-4'>
          <SmartImage
            src={item.coverUrl || PROMPT_COVER_PLACEHOLDER}
            alt={item.title}
            className='h-48 w-full rounded-lg object-cover' />
          {item.referenceImageUrls.length ? (
            <div className='grid grid-cols-4 gap-2'>
              {item.referenceImageUrls.map((url) => (
                <SmartImage
                  key={url}
                  src={url}
                  alt=''
                  className='aspect-square rounded object-cover' />
              ))}
            </div>
          ) : null}
          {item.tags.length ? (
            <div className='flex flex-wrap gap-1.5'>
              {item.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          ) : null}
          {item.description ? (
            <p className='text-muted-foreground text-sm leading-6'>
              {item.description}
            </p>
          ) : null}
          <div>
            <div className='mb-2 text-sm font-medium'>{t('Prompt')}</div>
            <pre className='bg-muted max-h-[50vh] overflow-auto rounded-lg p-3 text-sm leading-6 whitespace-pre-wrap'>
              {item.prompt}
            </pre>
          </div>
        </div>
      ) : null}
    </Drawer>
  )
}
