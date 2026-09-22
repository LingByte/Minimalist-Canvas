import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'

type SiteHeaderNavItemOptions = {
  active?: boolean
  highlight?: boolean
  compact?: boolean
}

/** Shared nav / CTA class names for site + canvas headers. */
export function getSiteHeaderNavItemClassName({
  active = false,
  highlight = false,
  compact = false,
}: SiteHeaderNavItemOptions = {}) {
  if (highlight) {
    return cn(
      'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium tracking-tight transition-[transform,opacity,background-color] duration-200',
      'bg-foreground text-background hover:opacity-90 active:scale-[0.98]',
      compact && 'h-10 w-full justify-start rounded-xl px-4 text-sm'
    )
  }

  if (compact) {
    return cn(
      'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium tracking-tight transition-colors',
      active
        ? 'bg-foreground/5 text-foreground'
        : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground'
    )
  }

  return cn(
    'relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium tracking-tight transition-[color,background-color,box-shadow,transform] duration-200',
    active
      ? 'bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-stone-900 dark:shadow-[0_1px_2px_rgb(0_0_0/0.35),0_0_0_1px_rgb(255_255_255/0.08)]'
      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground dark:hover:bg-stone-900/70',
    'active:scale-[0.98]'
  )
}

/** @deprecated Prefer getSiteHeaderNavItemClassName */
export function getTopNavLinkClassName(
  link: TopNavLink,
  {
    isActive = false,
    variant: _variant = 'public',
  }: { isActive?: boolean; variant?: 'public' | 'compact' } = {}
) {
  return getSiteHeaderNavItemClassName({
    active: isActive,
    highlight: !!link.highlight,
    // legacy "compact" meant denser desktop text; map to pill, not mobile list
    compact: false,
  })
}

export const siteHeaderChromeClassName = cn(
  'site-header sticky top-0 z-50 h-14 shrink-0',
  'bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55',
  'before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:h-px',
  'before:bg-gradient-to-r before:from-transparent before:via-border before:to-transparent'
)

export const siteHeaderInnerClassName =
  'relative mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8'

export const siteHeaderNavTrackClassName = cn(
  'hide-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full',
  'border border-border/70 bg-muted/45 p-1',
  'dark:border-border/50 dark:bg-muted/25'
)

export const siteHeaderBrandClassName =
  'group flex min-w-0 shrink-0 items-center gap-2.5 text-foreground transition-opacity hover:opacity-80'

export const siteHeaderActionsClassName =
  'flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2'

export const siteHeaderDividerClassName =
  'mx-0.5 hidden h-4 w-px shrink-0 bg-border/80 sm:block'

export const SITE_HEADER_NAV_PILL_LAYOUT_ID = 'site-header-nav-active-pill'
export const CANVAS_HEADER_NAV_PILL_LAYOUT_ID = 'canvas-header-nav-active-pill'

/** Link class for animated pill items (active bg drawn by motion pill). */
export function siteHeaderNavItemLinkClassName(options: {
  active?: boolean
  highlight?: boolean
  compact?: boolean
}) {
  if (options.highlight || options.compact) {
    return getSiteHeaderNavItemClassName(options)
  }

  return cn(
    'relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium tracking-tight transition-colors duration-200',
    options.active
      ? 'text-foreground'
      : 'text-muted-foreground hover:text-foreground',
    'active:scale-[0.98]'
  )
}
