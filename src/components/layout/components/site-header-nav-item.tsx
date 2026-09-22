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
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

import { SITE_HEADER_NAV_PILL_LAYOUT_ID } from '../utils/top-nav-link-styles'

type SiteHeaderNavItemContentProps = {
  active?: boolean
  highlight?: boolean
  compact?: boolean
  layoutId?: string
  className?: string
  children: React.ReactNode
}

/**
 * Shared nav chip content with a spring-sliding active pill (layout animation).
 */
export function SiteHeaderNavItemContent(props: SiteHeaderNavItemContentProps) {
  const shouldReduce = useReducedMotion()
  const highlight = !!props.highlight
  const compact = !!props.compact
  const active = !!props.active
  const layoutId = props.layoutId || SITE_HEADER_NAV_PILL_LAYOUT_ID

  if (highlight || compact) {
    return props.children
  }

  return (
    <>
      {active && !shouldReduce ? (
        <motion.span
          layoutId={layoutId}
          className='bg-background absolute inset-0 z-0 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-stone-900 dark:shadow-[0_1px_2px_rgb(0_0_0/0.35),0_0_0_1px_rgb(255_255_255/0.08)]'
          transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.6 }}
        />
      ) : null}
      {active && shouldReduce ? (
        <span className='bg-background absolute inset-0 z-0 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-stone-900 dark:shadow-[0_1px_2px_rgb(0_0_0/0.35),0_0_0_1px_rgb(255_255_255/0.08)]' />
      ) : null}
      <span
        className={cn(
          'relative z-10 inline-flex items-center gap-1.5',
          props.className
        )}
      >
        {props.children}
      </span>
    </>
  )
}
