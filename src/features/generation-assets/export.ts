import { saveAs } from 'file-saver'

import { formatTimestampToDate } from '@/lib/format'

import { listAdminGenerationAssets } from './api'
import type { GenerationAssetAdminItem, GenerationAssetFile } from './types'

export const GENERATION_ASSET_EXPORT_MAX_ROWS = 5_000
const EXPORT_PAGE_SIZE = 100

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

function isOwnStorageUrl(raw: string, publicBase: string): boolean {
  const url = raw.trim()
  if (!url) return false
  if (url.startsWith('/api/storage/files/')) return true
  try {
    const parsed = new URL(url)
    if (parsed.pathname.startsWith('/api/storage/files/')) return true
    if (!publicBase) return false
    const base = new URL(publicBase)
    const host = parsed.host.toLowerCase()
    const baseHost = base.host.toLowerCase()
    if (host === baseHost) return true
    const dot = baseHost.indexOf('.')
    if (dot >= 0) {
      const parent = baseHost.slice(dot + 1)
      if (parent && host.endsWith('.' + parent)) return true
    }
  } catch {
    return false
  }
  return false
}

/** Primary remirror URL only. Backup object-storage links are never included. */
export function mirroredPrimaryUrl(
  file: GenerationAssetFile,
  publicBase: string
): string {
  const url = file.url?.trim() || ''
  if (!url) return ''
  const backup = file.backup_url?.trim() || ''
  if (backup && url === backup) return ''
  const stage = (file.mirror_stage || '').toLowerCase()
  if (stage === 'upstream' || stage === 'backup') return ''
  if (stage === 'qihou' || stage === 'primary' || stage === 'done') return url
  if (isOwnStorageUrl(url, publicBase)) return url
  return ''
}

export function mirroredPrimaryUrls(
  item: GenerationAssetAdminItem,
  publicBase: string
): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const file of item.assets || []) {
    const url = mirroredPrimaryUrl(file, publicBase)
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

export async function fetchGenerationAssetsForExport(params: {
  kind?: string
  source?: string
  status?: string
  model?: string
  userId?: number
  startTimestamp?: number
  endTimestamp?: number
  maxRows?: number
}): Promise<{ items: GenerationAssetAdminItem[]; truncated: boolean }> {
  const maxRows = params.maxRows ?? GENERATION_ASSET_EXPORT_MAX_ROWS
  const items: GenerationAssetAdminItem[] = []
  let page = 1
  let total = 0
  while (items.length < maxRows) {
    const data = await listAdminGenerationAssets({
      page,
      pageSize: EXPORT_PAGE_SIZE,
      kind: params.kind,
      source: params.source,
      status: params.status,
      model: params.model,
      userId: params.userId,
      startTimestamp: params.startTimestamp,
      endTimestamp: params.endTimestamp,
    })
    total = data.total
    items.push(...data.items)
    if (data.items.length < EXPORT_PAGE_SIZE || items.length >= total) break
    page += 1
  }
  const truncated = items.length > maxRows || (total > maxRows && items.length >= maxRows)
  return { items: items.slice(0, maxRows), truncated }
}

export function downloadGenerationAssetsCsv(
  items: GenerationAssetAdminItem[],
  headers: string[],
  publicBase: string
) {
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const item of items) {
    const values = [
      item.created_at ? formatTimestampToDate(item.created_at, 'seconds') : '',
      item.username || '',
      item.user_id ? String(item.user_id) : '',
      item.kind || '',
      item.source || '',
      item.model || '',
      item.status || '',
      item.task_id || '',
      (item.prompt || '').replaceAll(/\s+/g, ' ').trim(),
      mirroredPrimaryUrls(item, publicBase).join('\n'),
    ]
    lines.push(values.map(escapeCsvCell).join(','))
  }
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  saveAs(blob, `generation-assets-${Date.now()}.csv`)
}
