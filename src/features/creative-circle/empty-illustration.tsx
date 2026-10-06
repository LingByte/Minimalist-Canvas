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
import { Empty } from 'antd'
import type { ReactNode } from 'react'

import { SmartImage } from '@/components/smart-image'
import { cn } from '@/lib/utils'

export const CIRCLE_EMPTY_IMAGE = '/images/empty/circle-favorites.png?v=31'

export function CircleEmptyIllustration({
  className,
  size = 168,
}: {
  className?: string
  size?: number
}) {
  return (
    <SmartImage
      src={CIRCLE_EMPTY_IMAGE}
      alt=''
      className={cn('mx-auto object-contain', className)}
      style={{ width: size, height: size }}
      loading='lazy'
      decoding='async'
      fallbackIconClassName='size-10'
    />
  )
}

export function CircleEmpty({
  description,
  className,
  size = 168,
}: {
  description: ReactNode
  className?: string
  size?: number
}) {
  return (
    <Empty
      className={className}
      image={<CircleEmptyIllustration size={size} />}
      imageStyle={{ height: size }}
      description={description}
    />
  )
}
