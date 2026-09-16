import type { GenerationAssetFile } from './types'

export type MirrorStatusKind = 'none' | 'upstream' | 'qihou' | 'done' | 'failed'

export type MirrorStatus = {
  kind: MirrorStatusKind
  labelKey: string
  color: string
  error?: string
  backupUrl?: string
  upstreamUrl?: string
}

function fileStage(file: GenerationAssetFile): MirrorStatus {
  const stage = (file.mirror_stage || '').toLowerCase()
  const error = file.mirror_error?.trim() || ''
  const backupUrl = file.backup_url?.trim() || ''
  const upstreamUrl = file.upstream_url?.trim() || ''

  if (backupUrl && !error) {
    return {
      kind: 'done',
      labelKey: 'Backup complete',
      color: 'success',
      backupUrl,
      upstreamUrl,
    }
  }
  if (error) {
    if (stage === 'qihou' || backupUrl) {
      return {
        kind: 'failed',
        labelKey: 'Backup failed',
        color: 'error',
        error,
        backupUrl: backupUrl || undefined,
        upstreamUrl,
      }
    }
    return {
      kind: 'failed',
      labelKey: 'Qihou failed',
      color: 'error',
      error,
      upstreamUrl,
    }
  }
  if (stage === 'done') {
    return {
      kind: 'done',
      labelKey: 'Backup complete',
      color: 'success',
      backupUrl: backupUrl || undefined,
      upstreamUrl,
    }
  }
  if (stage === 'qihou') {
    return {
      kind: 'qihou',
      labelKey: 'Qihou uploaded',
      color: 'processing',
      upstreamUrl,
    }
  }
  if (stage === 'upstream' || stage === 'backup') {
    return {
      kind: 'upstream',
      labelKey: 'Waiting for remirror',
      color: 'warning',
      upstreamUrl: upstreamUrl || file.url?.trim() || '',
    }
  }
  return {
    kind: 'none',
    labelKey: '',
    color: 'default',
    backupUrl: backupUrl || undefined,
    upstreamUrl,
  }
}

const KIND_RANK: Record<MirrorStatusKind, number> = {
  failed: 4,
  upstream: 3,
  qihou: 2,
  done: 1,
  none: 0,
}

export function summarizeMirrorStatus(files: GenerationAssetFile[] | undefined): MirrorStatus {
  const list = files || []
  if (!list.length) {
    return { kind: 'none', labelKey: '', color: 'default' }
  }
  let best = fileStage(list[0])
  for (const file of list.slice(1)) {
    const next = fileStage(file)
    if (KIND_RANK[next.kind] > KIND_RANK[best.kind]) {
      best = next
    }
  }
  return best
}

export function needsDualMirror(file: GenerationAssetFile): boolean {
  const status = fileStage(file)
  return status.kind === 'upstream' || status.kind === 'qihou' || status.kind === 'failed'
}
