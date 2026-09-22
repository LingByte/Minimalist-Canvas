import { cn } from '@/lib/utils'

/**
 * Desktop stand-in for the site's PublicLayout. The desktop shell already
 * renders its own top navigation via UserLayout, so this only provides the
 * scrollable content area the ported site pages expect.
 */
type PublicLayoutProps = {
  children: React.ReactNode
  showMainContainer?: boolean
  navContent?: React.ReactNode
  headerProps?: Record<string, unknown>
  navLinks?: unknown[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: React.ReactNode
  siteName?: string
  className?: string
}

export function PublicLayout(props: PublicLayoutProps) {
  return (
    <div
      className={cn(
        'bg-background text-foreground relative h-full min-h-0 overflow-x-clip overflow-y-auto',
        props.className
      )}
    >
      {props.showMainContainer !== false ? (
        <main className='container px-4 py-6 md:px-4'>{props.children}</main>
      ) : (
        props.children
      )}
    </div>
  )
}
