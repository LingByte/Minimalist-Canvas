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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  sidebarNavIconChipClassName,
  sidebarNavItemClassName,
  sidebarNavLabelClassName,
  sidebarNavPillClassName,
  type SidebarNavOrientation,
} from '@/components/layout/utils/sidebar-nav-styles'
import { cn } from '@/lib/utils'

export const SIDEBAR_NAV_PILL_LAYOUT_ID = 'desktop-sidebar-nav-pill'

const pillTransition = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 32,
  mass: 0.7,
}

type SidebarNavItemProps = {
  href: string
  active: boolean
  title: string
  icon: LucideIcon
  layoutId?: string
  onClick?: (event: MouseEvent) => void
  className?: string
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  showLabel?: boolean
  /** horizontal = icon + text in one row (desktop app sidebar). */
  orientation?: SidebarNavOrientation
  showTooltip?: boolean
}

export function SidebarNavItem({
  href,
  active,
  title,
  icon: Icon,
  layoutId = SIDEBAR_NAV_PILL_LAYOUT_ID,
  onClick,
  className,
  tooltipSide = 'right',
  showLabel = true,
  orientation = 'vertical',
  showTooltip,
}: SidebarNavItemProps) {
  const shouldReduce = useReducedMotion()
  const horizontal = orientation === 'horizontal'
  const tooltipEnabled = showTooltip ?? !horizontal

  const pill = active ? (
    shouldReduce ? (
      <span aria-hidden className={sidebarNavPillClassName(orientation)} />
    ) : (
      <motion.span
        layoutId={layoutId}
        aria-hidden
        className={sidebarNavPillClassName(orientation)}
        transition={pillTransition}
        initial={false}
      />
    )
  ) : null

  const content: ReactNode = (
    <>
      {horizontal ? pill : null}
      <span className={sidebarNavIconChipClassName(active, orientation)}>
        {!horizontal ? pill : null}
        <Icon
          className={cn(
            'relative z-10 stroke-[2]',
            horizontal ? 'size-4' : 'size-[1.15rem]',
          )}
          aria-hidden
        />
      </span>
      {showLabel ? (
        <span className={sidebarNavLabelClassName(active, orientation)}>{title}</span>
      ) : null}
    </>
  )

  const linkClassName = cn(sidebarNavItemClassName(active, orientation), className)

  if (!tooltipEnabled) {
    return (
      <Link
        to={href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        aria-label={title}
        data-active={active ? 'true' : undefined}
        className={linkClassName}
      >
        {content}
      </Link>
    )
  }

  return (
    <TooltipProvider delay={280}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to={href}
              onClick={onClick}
              aria-current={active ? 'page' : undefined}
              aria-label={title}
              data-active={active ? 'true' : undefined}
              className={linkClassName}
            />
          }
        >
          {content}
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} sideOffset={10}>
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
