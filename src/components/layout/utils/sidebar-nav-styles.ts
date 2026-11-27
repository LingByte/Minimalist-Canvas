import { cn } from '@/lib/utils'

/** Vertical icon-rail item: icon chip + caption. */
export function sidebarNavItemClassName(active: boolean) {
  return cn(
    'group/nav relative flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2 outline-none',
    'transition-[color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
    'focus-visible:ring-2 focus-visible:ring-sky-500/40',
    'active:scale-[0.97]',
    active
      ? 'text-stone-950 dark:text-stone-50'
      : 'text-sidebar-foreground/55 hover:text-sidebar-foreground'
  )
}

/** Soft resting chip around the icon. Active fill comes from the sliding layout pill. */
export function sidebarNavIconChipClassName(active: boolean) {
  return cn(
    'relative z-10 grid size-9 place-items-center rounded-[0.7rem] border',
    'transition-[background,border-color,color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
    active
      ? 'border-transparent bg-transparent text-white shadow-none dark:text-stone-950'
      : 'border-transparent bg-transparent text-current group-hover/nav:border-stone-200/80 group-hover/nav:bg-stone-100/80 dark:group-hover/nav:border-stone-700/80 dark:group-hover/nav:bg-stone-800/70'
  )
}

export function sidebarNavLabelClassName(active: boolean) {
  return cn(
    'relative z-10 max-w-full truncate text-center text-[10px] leading-tight tracking-wide',
    'transition-[color,font-weight,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
    active ? 'font-semibold' : 'font-medium'
  )
}
