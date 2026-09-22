import { cn } from '@/lib/utils'

/** Vertical site / canvas sidebar item — icon + label only, no square border box. */
export function sidebarNavItemClassName(active: boolean) {
  return cn(
    'relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-colors duration-200',
    active
      ? 'text-sky-600 dark:text-sky-400'
      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
  )
}

export function sidebarNavIndicatorClassName() {
  return 'pointer-events-none absolute inset-x-3 -bottom-0.5 h-[2px] rounded-full bg-sky-500 dark:bg-sky-400'
}
