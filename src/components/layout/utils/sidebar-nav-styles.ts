import { cn } from '@/lib/utils'

export type SidebarNavOrientation = 'vertical' | 'horizontal'

/** Nav item shell — vertical icon rail or horizontal icon+label row. */
export function sidebarNavItemClassName(
  active: boolean,
  orientation: SidebarNavOrientation = 'vertical',
) {
  return cn(
    'group/nav relative flex w-full outline-none',
    'transition-[color,transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
    'focus-visible:ring-2 focus-visible:ring-emerald-500/35',
    'active:scale-[0.98]',
    orientation === 'horizontal'
      ? 'flex-row items-center gap-2 rounded-lg px-2 py-1'
      : 'flex-col items-center justify-center rounded-lg px-0.5 py-0.5',
    active
      ? 'text-stone-950 dark:text-stone-50'
      : 'text-sidebar-foreground/55 hover:text-sidebar-foreground',
  )
}

/** Soft resting chip around the icon. Active fill comes from the sliding layout pill. */
export function sidebarNavIconChipClassName(
  active: boolean,
  orientation: SidebarNavOrientation = 'vertical',
) {
  return cn(
    'relative z-10 grid place-items-center border',
    'transition-[background,border-color,color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
    orientation === 'horizontal'
      ? 'size-7 shrink-0 rounded-lg'
      : 'size-8 rounded-lg',
    active
      ? 'border-transparent bg-transparent text-current'
      : orientation === 'horizontal'
        ? 'border-transparent bg-transparent text-current'
        : 'border-transparent bg-transparent text-current group-hover/nav:bg-stone-100/70 dark:group-hover/nav:bg-white/[0.06]',
  )
}

export function sidebarNavLabelClassName(
  active: boolean,
  orientation: SidebarNavOrientation = 'vertical',
) {
  return cn(
    'relative z-10 min-w-0 tracking-wide text-current',
    'transition-[color,font-weight,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
    orientation === 'horizontal'
      ? 'flex-1 truncate text-left text-[12.5px] leading-none'
      : 'max-w-full truncate text-center text-[10px] leading-tight',
    active ? 'font-semibold' : 'font-medium',
  )
}

/** Soft selected surface — readable in light/dark without forcing white-on-black. */
export function sidebarNavPillClassName(orientation: SidebarNavOrientation = 'vertical') {
  return cn(
    'pointer-events-none absolute z-0 border border-stone-900/10 bg-stone-900/[0.08] shadow-none dark:border-white/10 dark:bg-white/[0.08]',
    orientation === 'horizontal'
      ? 'inset-0 rounded-lg'
      : 'inset-0 rounded-lg',
  )
}
