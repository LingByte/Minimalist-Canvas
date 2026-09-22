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
import type { LucideIcon } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import {
  sidebarNavIndicatorClassName,
  sidebarNavItemClassName,
} from '@/components/layout/utils/sidebar-nav-styles'
import { cn } from '@/lib/utils'

export const SIDEBAR_NAV_PILL_LAYOUT_ID = 'desktop-sidebar-nav-pill'

const pillTransition = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 34,
  mass: 0.55,
}

type SidebarNavItemProps = {
  href: string
  active: boolean
  title: string
  icon: LucideIcon
  layoutId?: string
  onClick?: (event: MouseEvent) => void
  className?: string
  children?: ReactNode
}

export function SidebarNavItem({
  href,
  active,
  title,
  icon: Icon,
  layoutId = SIDEBAR_NAV_PILL_LAYOUT_ID,
  onClick,
  className,
}: SidebarNavItemProps) {
  const shouldReduce = useReducedMotion()

  return (
    <Link
      to={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(sidebarNavItemClassName(active), className)}
    >
      {active && !shouldReduce ? (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className='pointer-events-none absolute inset-x-1 inset-y-0.5 z-0 rounded-xl bg-sky-500/12 dark:bg-sky-400/15'
          transition={pillTransition}
        />
      ) : null}
      {active && shouldReduce ? (
        <span
          aria-hidden
          className='pointer-events-none absolute inset-x-1 inset-y-0.5 z-0 rounded-xl bg-sky-500/12 dark:bg-sky-400/15'
        />
      ) : null}
      {active ? (
        <motion.span
          layoutId={shouldReduce ? undefined : `${layoutId}-underline`}
          aria-hidden
          className={cn(sidebarNavIndicatorClassName(), 'z-10')}
          transition={pillTransition}
        />
      ) : null}
      <Icon className='relative z-10 size-[1.3rem] stroke-[1.75]' aria-hidden />
      <span className='relative z-10 max-w-full truncate text-center text-[10px] leading-tight font-medium tracking-wide'>
        {title}
      </span>
    </Link>
  )
}
