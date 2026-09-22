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
import { isUnstableMediaUrl } from '@canvas/lib/signed-url'
import type { CanvasProject } from '@canvas/stores/canvas/use-canvas-store'
import type {
  CanvasAssistantMessage,
  CanvasAssistantSession,
  CanvasNodeData,
  CanvasNodeImage,
  CanvasNodeMetadata,
} from '@canvas/types/canvas'

function isDurableUrl(value: string) {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) && !isUnstableMediaUrl(trimmed)
}

function sanitizeMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return ''
  if (isDurableUrl(trimmed)) return trimmed
  return ''
}

function sanitizeNodeImage(image: CanvasNodeImage): CanvasNodeImage {
  return {
    ...image,
    content: sanitizeMediaUrl(image.content),
  }
}

function sanitizeMetadata(
  metadata: CanvasNodeMetadata | undefined
): CanvasNodeMetadata | undefined {
  if (!metadata) return metadata
  const next: CanvasNodeMetadata = { ...metadata }
  if (typeof next.content === 'string') {
    // Drop blob/data and short-lived upstream hotlinks (Dola/TOS/etc.).
    next.content = sanitizeMediaUrl(next.content)
  }
  if (Array.isArray(next.images)) {
    next.images = next.images.map(sanitizeNodeImage)
  }
  if (Array.isArray(next.references)) {
    next.references = next.references
      .map((item) =>
        typeof item === 'string' ? sanitizeMediaUrl(item) || item : item
      )
      .filter(
        (item) =>
          typeof item !== 'string' ||
          (!item.startsWith('blob:') && !item.startsWith('data:'))
      )
  }
  return next
}

function sanitizeNode(node: CanvasNodeData): CanvasNodeData {
  return {
    ...node,
    metadata: sanitizeMetadata(node.metadata),
  }
}

function sanitizeMessage(message: CanvasAssistantMessage): CanvasAssistantMessage {
  return {
    ...message,
    references: message.references?.map((ref) => ({
      ...ref,
      dataUrl: sanitizeMediaUrl(ref.dataUrl || '') || undefined,
    })),
  }
}

function sanitizeSession(session: CanvasAssistantSession): CanvasAssistantSession {
  return {
    ...session,
    messages: (session.messages || []).map(sanitizeMessage),
  }
}

/** Drop non-portable blob/data media before uploading a project backup. */
export function sanitizeProjectForSync(project: CanvasProject): CanvasProject {
  return {
    ...project,
    nodes: (project.nodes || []).map(sanitizeNode),
    connections: project.connections || [],
    chatSessions: (project.chatSessions || []).map(sanitizeSession),
    viewport: project.viewport,
  }
}
