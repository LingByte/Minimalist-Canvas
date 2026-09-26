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
import {
  BookOpen,
  Boxes,
  CircleHelp,
  Frame,
  History,
  Home,
  LayoutDashboard,
  ListTodo,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { startTransition, useCallback, useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { SmartImage } from '@/components/smart-image'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SidebarNavItem } from '@/components/layout/components/sidebar-nav-item'
import { useDesktopSiteNavLinks } from '@/hooks/use-desktop-site-nav-links'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

const NAV_ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/dashboard': LayoutDashboard,
  '/usage-logs/common': ScrollText,
  '/usage-logs/task': ListTodo,
  '/canvas': Frame,
  '/generation-logs': History,
  '/pricing': Boxes,
  '/docs': BookOpen,
  '/faq': CircleHelp,
}

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/home'
  if (href === '/canvas') {
    return pathname === '/canvas' || pathname.startsWith('/canvas/')
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

export function DesktopSiteSidebar(props: { className?: string }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const links = useDesktopSiteNavLinks()
  const { systemName, logo } = useSystemConfig()
  const user = useAuthStore((state) => state.auth.user)
  const isAuthenticated = Boolean(user)
  const logoUrl = logo || DEFAULT_LOGO

  const items = useMemo(
    () =>
      links.map((link) => ({
        ...link,
        icon: NAV_ICONS[link.href] ?? Boxes,
      })),
    [links]
  )

  const go = useCallback(
    (href: string, event: MouseEvent) => {
      if (isModifiedClick(event)) return
      event.preventDefault()
      startTransition(() => {
        navigate(href)
      })
    },
    [navigate]
  )

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground border-sidebar-border flex h-dvh w-[4.75rem] shrink-0 flex-col items-center border-r',
        props.className
      )}
      aria-label={t('Primary')}
    >
      <Link
        to='/'
        onClick={(event) => go('/', event)}
        className='flex h-14 w-full items-center justify-center px-2 transition-opacity hover:opacity-90'
        aria-label={systemName}
      >
        <SmartImage
          src={logoUrl}
          alt={t('Logo')}
          className='h-8 w-auto max-w-[2.5rem] object-contain'
          fallbackIconClassName='text-sidebar-foreground size-5'
        />
      </Link>

      <nav className='mt-1 flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {items.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            active={isNavActive(pathname, item.href)}
            title={item.title}
            icon={item.icon}
            onClick={(event) => go(item.href, event)}
          />
        ))}
      </nav>

      <div className='border-sidebar-border flex w-full flex-col items-center gap-2 border-t px-2 py-3'>
        {isAuthenticated ? (
          <div className='flex w-full justify-center'>
            <ProfileDropdown />
          </div>
        ) : (
          <Link
            to='/sign-in'
            className='inline-flex h-8 w-full items-center justify-center rounded-full border border-sky-500/35 text-[11px] font-medium tracking-wide text-sky-700 transition hover:bg-sky-500/10 dark:text-sky-300'
          >
            {t('Sign in')}
          </Link>
        )}
      </div>
    </aside>
  )
}
