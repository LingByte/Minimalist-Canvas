import { ROLE } from './roles'

export type AdminPermissionMatrix = Record<string, Record<string, boolean>>
export type AdminCapabilities = AdminPermissionMatrix

export const ADMIN_PERMISSION_RESOURCES = {
  CHANNEL: 'channel',
} as const

export const ADMIN_PERMISSION_ACTIONS = {
  READ: 'read',
  OPERATE: 'operate',
  WRITE: 'write',
  SENSITIVE_WRITE: 'sensitive_write',
  SECRET_VIEW: 'secret_view',
} as const

export const ADMIN_ROLE_KEY = 'admin'

export function hasAdminCapability(
  _capabilities: AdminCapabilities | null | undefined,
  _resource: string,
  _action: string
): boolean {
  return false
}

export function isAdminRole(role: number | undefined | null): boolean {
  return (role ?? 0) >= ROLE.ADMIN
}
