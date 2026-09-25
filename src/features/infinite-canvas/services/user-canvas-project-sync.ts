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
  deleteUserCanvasProjectsByClientIds,
  getUserCanvasProjectByClientId,
  listUserCanvasProjects,
  putUserCanvasProjectByClientId,
} from '@canvas/services/api/user-canvas-projects'
import { sanitizeProjectForSync } from '@canvas/services/sanitize-canvas-project'
import {
  useCanvasStore,
  type CanvasProject,
} from '@canvas/stores/canvas/use-canvas-store'
import type { CanvasBackgroundMode } from '@canvas/lib/canvas-theme'
import type { ViewportTransform } from '@canvas/types/canvas'

/** Coalesce rapid dirty marks before starting the cloud throttle window. */
const DIRTY_COALESCE_MS = 1500
/** Upload a new object-storage JSON version at most this often per project. */
const CLOUD_THROTTLE_MS = 10 * 60 * 1000
const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 }

let subscribed = false
let flushListenersBound = false
let skipPushUntil = 0
let restorePromise: Promise<void> | null = null
const dirtyCoalesceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const throttleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>()
const dirtyProjectIds = new Set<string>()
const inFlightPutIds = new Set<string>()
const saveStatusListeners = new Set<() => void>()

function notifySaveStatus() {
  for (const listener of saveStatusListeners) listener()
}

export type CanvasProjectSaveStatus = {
  dirty: boolean
  saving: boolean
}

/** Stable-referenced snapshots so useSyncExternalStore does not re-render infinitely. */
const statusCache = new Map<string, CanvasProjectSaveStatus>()

export function getCanvasProjectSaveStatus(projectId?: string): CanvasProjectSaveStatus {
  const key = projectId || '__all__'
  const saving = projectId ? inFlightPutIds.has(projectId) : inFlightPutIds.size > 0
  const dirty =
    saving ||
    (projectId ? dirtyProjectIds.has(projectId) : dirtyProjectIds.size > 0) ||
    (projectId ? dirtyCoalesceTimers.has(projectId) : dirtyCoalesceTimers.size > 0) ||
    (projectId ? throttleTimers.has(projectId) : throttleTimers.size > 0)
  const prev = statusCache.get(key)
  if (prev && prev.dirty === dirty && prev.saving === saving) return prev
  const next = { dirty, saving }
  statusCache.set(key, next)
  return next
}

export function subscribeCanvasProjectSaveStatus(listener: () => void): () => void {
  saveStatusListeners.add(listener)
  return () => {
    saveStatusListeners.delete(listener)
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeRemoteProject(
  raw: unknown,
  clientId: string,
  fallbackTitle?: string
): CanvasProject | null {
  const root = asObject(raw)
  if (!root) return null
  const now = new Date().toISOString()
  const title =
    (typeof root.title === 'string' && root.title.trim()) ||
    fallbackTitle ||
    'Untitled'
  const createdAt =
    typeof root.createdAt === 'string' && root.createdAt ? root.createdAt : now
  const updatedAt =
    typeof root.updatedAt === 'string' && root.updatedAt ? root.updatedAt : now
  const backgroundMode =
    root.backgroundMode === 'dots' ||
    root.backgroundMode === 'blank' ||
    root.backgroundMode === 'lines'
      ? (root.backgroundMode as CanvasBackgroundMode)
      : 'lines'
  const viewport = asObject(root.viewport)
  return {
    id: clientId,
    title,
    createdAt,
    updatedAt,
    nodes: Array.isArray(root.nodes) ? (root.nodes as CanvasProject['nodes']) : [],
    connections: Array.isArray(root.connections)
      ? (root.connections as CanvasProject['connections'])
      : [],
    chatSessions: Array.isArray(root.chatSessions)
      ? (root.chatSessions as CanvasProject['chatSessions'])
      : [],
    activeChatId:
      typeof root.activeChatId === 'string' ? root.activeChatId : null,
    backgroundMode,
    showImageInfo: Boolean(root.showImageInfo),
    viewport: {
      x: typeof viewport?.x === 'number' ? viewport.x : initialViewport.x,
      y: typeof viewport?.y === 'number' ? viewport.y : initialViewport.y,
      k: typeof viewport?.k === 'number' ? viewport.k : initialViewport.k,
    },
  }
}

async function pushProject(projectId: string) {
  if (Date.now() < skipPushUntil) return
  const project = useCanvasStore
    .getState()
    .projects.find((item) => item.id === projectId)
  if (!project) return
  const sanitized = sanitizeProjectForSync(project)
  inFlightPutIds.add(projectId)
  notifySaveStatus()
  try {
    const dto = await putUserCanvasProjectByClientId(projectId, sanitized)
    if (!dto) return
    dirtyProjectIds.delete(projectId)
    const syncedAt = dto.updated_at
      ? new Date(dto.updated_at * 1000).toISOString()
      : new Date().toISOString()
    useCanvasStore.getState().markProjectCloudSynced(projectId, syncedAt)
  } finally {
    inFlightPutIds.delete(projectId)
    notifySaveStatus()
  }
}

function clearProjectTimers(projectId: string) {
  const coalesce = dirtyCoalesceTimers.get(projectId)
  if (coalesce) {
    clearTimeout(coalesce)
    dirtyCoalesceTimers.delete(projectId)
  }
  const throttle = throttleTimers.get(projectId)
  if (throttle) {
    clearTimeout(throttle)
    throttleTimers.delete(projectId)
  }
}

/** Mark project dirty for cloud; upload after CLOUD_THROTTLE_MS (not every edit). */
function markCloudDirty(projectId: string) {
  if (Date.now() < skipPushUntil) return
  dirtyProjectIds.add(projectId)
  notifySaveStatus()

  const existingCoalesce = dirtyCoalesceTimers.get(projectId)
  if (existingCoalesce) clearTimeout(existingCoalesce)
  dirtyCoalesceTimers.set(
    projectId,
    setTimeout(() => {
      dirtyCoalesceTimers.delete(projectId)
      ensureThrottleTimer(projectId)
      notifySaveStatus()
    }, DIRTY_COALESCE_MS)
  )
}

function ensureThrottleTimer(projectId: string) {
  if (throttleTimers.has(projectId)) return
  throttleTimers.set(
    projectId,
    setTimeout(() => {
      throttleTimers.delete(projectId)
      if (!dirtyProjectIds.has(projectId)) {
        notifySaveStatus()
        return
      }
      void pushProject(projectId).catch(() => undefined)
    }, CLOUD_THROTTLE_MS)
  )
  notifySaveStatus()
}

function scheduleDelete(projectId: string) {
  if (Date.now() < skipPushUntil) return
  clearProjectTimers(projectId)
  dirtyProjectIds.delete(projectId)
  notifySaveStatus()
  const existing = deleteTimers.get(projectId)
  if (existing) clearTimeout(existing)
  deleteTimers.set(
    projectId,
    setTimeout(() => {
      deleteTimers.delete(projectId)
      void deleteUserCanvasProjectsByClientIds([projectId]).catch(() => undefined)
    }, 0)
  )
}

function projectNeedsCloudSync(older: CanvasProject | undefined, project: CanvasProject) {
  if (!older) return true
  // Ignore updatedAt: viewport-only patches also bump it in the store.
  // Viewport pan/zoom stays local — do not create OSS versions for it.
  return (
    older.title !== project.title ||
    older.nodes !== project.nodes ||
    older.connections !== project.connections ||
    older.chatSessions !== project.chatSessions ||
    older.activeChatId !== project.activeChatId ||
    older.backgroundMode !== project.backgroundMode ||
    older.showImageInfo !== project.showImageInfo
  )
}

/**
 * Local IndexedDB remains the source of truth for continuous edits.
 * Object-storage JSON versions upload on a long throttle, manual save, or page hide.
 */
export function ensureCanvasProjectBackupSubscription() {
  if (subscribed) return
  subscribed = true
  useCanvasStore.subscribe((state, prev) => {
    if (state.projects === prev.projects) return
    if (Date.now() < skipPushUntil) return

    const prevMap = new Map(prev.projects.map((item) => [item.id, item]))
    const nextIds = new Set(state.projects.map((item) => item.id))

    for (const id of prevMap.keys()) {
      if (!nextIds.has(id)) scheduleDelete(id)
    }

    for (const project of state.projects) {
      const older = prevMap.get(project.id)
      if (projectNeedsCloudSync(older, project)) {
        markCloudDirty(project.id)
      }
    }
  })
  ensureCanvasProjectFlushListeners()
}

/** Flush pending cloud PUTs (pagehide / hide / beforeunload). */
export async function flushCanvasProjectBackup(): Promise<void> {
  ensureCanvasProjectBackupSubscription()
  const ids = new Set(dirtyProjectIds)
  for (const [id, timer] of dirtyCoalesceTimers) {
    clearTimeout(timer)
    dirtyCoalesceTimers.delete(id)
    ids.add(id)
  }
  for (const [id, timer] of throttleTimers) {
    clearTimeout(timer)
    throttleTimers.delete(id)
    ids.add(id)
  }
  notifySaveStatus()
  await Promise.all(Array.from(ids).map((id) => pushProject(id).catch(() => undefined)))
}

/** Immediate cloud upload for manual Save / ⌘S. */
export async function saveCanvasProjectNow(projectId?: string): Promise<void> {
  ensureCanvasProjectBackupSubscription()
  const ids = new Set<string>()
  if (projectId) {
    ids.add(projectId)
    clearProjectTimers(projectId)
    dirtyProjectIds.delete(projectId)
  } else {
    for (const id of dirtyProjectIds) ids.add(id)
    for (const id of dirtyCoalesceTimers.keys()) ids.add(id)
    for (const id of throttleTimers.keys()) ids.add(id)
    for (const id of ids) clearProjectTimers(id)
    dirtyProjectIds.clear()
  }
  notifySaveStatus()
  if (ids.size === 0 && projectId) ids.add(projectId)

  const results = await Promise.allSettled(Array.from(ids).map((id) => pushProject(id)))
  const failed = results.find((result) => result.status === 'rejected')
  if (failed && failed.status === 'rejected') {
    throw failed.reason instanceof Error
      ? failed.reason
      : new Error('Failed to save canvas project')
  }
}

function ensureCanvasProjectFlushListeners() {
  if (flushListenersBound || typeof window === 'undefined') return
  flushListenersBound = true
  const flush = () => {
    void flushCanvasProjectBackup()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

function waitCanvasStoreHydrated(): Promise<void> {
  return new Promise((resolve) => {
    if (useCanvasStore.getState().hydrated) {
      resolve()
      return
    }
    const unsub = useCanvasStore.subscribe((state) => {
      if (!state.hydrated) return
      unsub()
      resolve()
    })
  })
}

/**
 * Fetch one cloud project and restore it locally, keeping the cloud client_id
 * so future syncs stay aligned. Suppresses the resulting echo-push.
 */
export async function pullCanvasProjectFromCloud(
  clientId: string
): Promise<CanvasProject | null> {
  ensureCanvasProjectBackupSubscription()
  const dto = await getUserCanvasProjectByClientId(clientId)
  if (!dto) return null
  const remote = normalizeRemoteProject(dto.project, clientId, dto.title)
  if (!remote) return null
  remote.cloudSyncedAt = dto.updated_at
    ? new Date(dto.updated_at * 1000).toISOString()
    : new Date().toISOString()
  // A different local canvas may already use this title — disambiguate the pulled copy.
  const localTitles = new Set(
    useCanvasStore
      .getState()
      .projects.filter((item) => item.id !== clientId)
      .map((item) => item.title)
  )
  if (localTitles.has(remote.title)) {
    let n = 2
    while (localTitles.has(`${remote.title} (${n})`)) n++
    remote.title = `${remote.title} (${n})`
  }
  skipPushUntil = Date.now() + 2500
  useCanvasStore.getState().restoreProject(remote)
  return remote
}

/**
 * Only when this browser has no local canvas projects, pull backups from the
 * server asynchronously. Never overwrites a non-empty local store.
 */
export async function restoreCanvasProjectsIfLocalEmpty(): Promise<void> {
  if (restorePromise) return restorePromise
  restorePromise = (async () => {
    ensureCanvasProjectBackupSubscription()
    await waitCanvasStoreHydrated()

    if (useCanvasStore.getState().projects.length > 0) return

    const summaries = await listUserCanvasProjects()
    if (!summaries.length) return
    if (useCanvasStore.getState().projects.length > 0) return

    const restored: CanvasProject[] = []
    await Promise.all(
      summaries.map(async (summary) => {
        const id = summary.client_id?.trim()
        if (!id) return
        const dto = await getUserCanvasProjectByClientId(id)
        const remote = normalizeRemoteProject(
          dto?.project,
          id,
          summary.title || dto?.title
        )
        if (remote) restored.push(remote)
      })
    )

    if (!restored.length) return
    if (useCanvasStore.getState().projects.length > 0) return

    skipPushUntil = Date.now() + 2500
    restored.sort(
      (a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
    )
    useCanvasStore.getState().replaceProjects(restored)
  })()
    .catch(() => undefined)
    .finally(() => {
      restorePromise = null
    })
  return restorePromise
}
