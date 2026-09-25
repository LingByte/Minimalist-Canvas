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
import { Avatar } from 'antd'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'

import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { cn } from '@/lib/utils'

type UserAvatarProps = {
  size?: number
  className?: string
  shape?: 'circle' | 'square'
  style?: CSSProperties
  /** Remote or data-URL avatar. Falls back to colored initials when empty. */
  src?: string | null
  /** Used for initials fallback and fallback color when no src. */
  name?: string | null
  alt?: string
  /** Extra className applied to the initials fallback. */
  fallbackClassName?: string
}

/**
 * User avatar: image when `src` is set, colored initials fallback otherwise.
 */
export function UserAvatar(props: UserAvatarProps) {
  const size = props.size ?? 32
  const name = (props.name ?? '').trim()
  const hasImage = Boolean(props.src)

  const fallbackStyle = useMemo(
    () => (hasImage ? props.style : { ...getUserAvatarStyle(name), ...props.style }),
    [hasImage, name, props.style]
  )

  return (
    <Avatar
      size={size}
      shape={props.shape ?? 'circle'}
      src={hasImage ? props.src! : undefined}
      alt={props.alt || name || undefined}
      style={fallbackStyle}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold',
        !hasImage && 'text-white',
        props.className
      )}
    >
      {!hasImage ? getUserAvatarFallback(name) : null}
    </Avatar>
  )
}
