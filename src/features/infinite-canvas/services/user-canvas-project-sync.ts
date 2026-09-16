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

const PUT_DEBOUNCE_MS = 1500
const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 }

let subscribed = false
let skipPushUntil = 0
let restorePromise: Promise<void> | null = null
const putTimers = new Map<string, ReturnType<typeof setTimeout>>()
const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>()

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
  await putUserCanvasProjectByClientId(projectId, sanitized)
}

function schedulePut(projectId: string) {
  if (Date.now() < skipPushUntil) return
  const existing = putTimers.get(projectId)
  if (existing) clearTimeout(existing)
  putTimers.set(
    projectId,
    setTimeout(() => {
      putTimers.delete(projectId)
      void pushProject(projectId).catch(() => undefined)
    }, PUT_DEBOUNCE_MS)
  )
}

function scheduleDelete(projectId: string) {
  if (Date.now() < skipPushUntil) return
  const putTimer = putTimers.get(projectId)
  if (putTimer) {
    clearTimeout(putTimer)
    putTimers.delete(projectId)
  }
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

/**
 * Push-only cloud backup after local edits.
 * IndexedDB remains the source of truth; server errors are ignored.
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
      if (
        !older ||
        older.updatedAt !== project.updatedAt ||
        older.title !== project.title ||
        older.nodes !== project.nodes ||
        older.connections !== project.connections ||
        older.chatSessions !== project.chatSessions ||
        older.activeChatId !== project.activeChatId ||
        older.backgroundMode !== project.backgroundMode ||
        older.showImageInfo !== project.showImageInfo ||
        older.viewport !== project.viewport
      ) {
        schedulePut(project.id)
      }
    }
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
    // Local may have gained projects while we fetched; never clobber them.
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
