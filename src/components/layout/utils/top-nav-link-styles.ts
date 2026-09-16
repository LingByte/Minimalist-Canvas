import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'

type TopNavLinkStyleOptions = {
  isActive?: boolean
  variant?: 'public' | 'compact'
}

/** Shared stone nav link styles used by PublicHeader and canvas AppTopNav. */
export function getTopNavLinkClassName(
  link: TopNavLink,
  { isActive = false, variant = 'public' }: TopNavLinkStyleOptions = {}
) {
  if (link.highlight) {
    return cn(
      'inline-flex items-center justify-center text-sm font-medium transition-colors duration-200',
      'rounded-md bg-stone-950 px-3.5 py-1.5 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white',
      link.disabled && 'pointer-events-none opacity-50'
    )
  }

  if (variant === 'compact') {
    return cn(
      'text-sm font-medium transition-colors',
      isActive
        ? 'text-stone-950 dark:text-stone-100'
        : 'text-stone-500 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100',
      link.disabled && 'pointer-events-none opacity-50'
    )
  }

  return cn(
    'relative flex h-14 shrink-0 items-center px-1 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px',
    isActive
      ? 'font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100'
      : 'text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100',
    link.disabled && 'pointer-events-none opacity-50'
  )
}

export const siteHeaderChromeClassName =
  'sticky top-0 z-50 h-14 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800'

export const siteHeaderInnerClassName =
  'mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-4 sm:px-6'
