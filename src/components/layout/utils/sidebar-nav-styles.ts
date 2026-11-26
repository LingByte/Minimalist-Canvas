import { cn } from '@/lib/utils'

/** Vertical icon-rail item: icon chip + caption. */
export function sidebarNavItemClassName(active: boolean) {
  return cn(
    'group/nav relative flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors duration-200 outline-none',
    'focus-visible:ring-2 focus-visible:ring-sky-500/40',
    active
      ? 'text-stone-950 dark:text-stone-50'
      : 'text-sidebar-foreground/55 hover:text-sidebar-foreground'
  )
}

/** Soft resting chip around the icon. */
export function sidebarNavIconChipClassName(active: boolean) {
  return cn(
    'relative z-10 grid size-9 place-items-center rounded-[0.7rem] border transition-[background,border-color,color,box-shadow] duration-200',
    active
      ? 'border-stone-900 bg-stone-900 text-white shadow-sm dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
      : 'border-transparent bg-transparent text-current group-hover/nav:border-stone-200/80 group-hover/nav:bg-stone-100/80 dark:group-hover/nav:border-stone-700/80 dark:group-hover/nav:bg-stone-800/70'
  )
}

export function sidebarNavLabelClassName(active: boolean) {
  return cn(
    'relative z-10 max-w-full truncate text-center text-[10px] leading-tight tracking-wide',
    active ? 'font-semibold' : 'font-medium'
  )
}
