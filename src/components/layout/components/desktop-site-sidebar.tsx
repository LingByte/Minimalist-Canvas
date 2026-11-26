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
import { FileText, Frame, Images, Settings2, Sparkles, type LucideIcon } from 'lucide-react'
import { startTransition, useCallback, useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { SmartImage } from '@/components/smart-image'
import { SidebarNavItem } from '@/components/layout/components/sidebar-nav-item'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'

const LOCAL_NAV: { href: string; titleKey: string; icon: LucideIcon }[] = [
  { href: '/canvas', titleKey: 'navigation.canvas', icon: Frame },
  { href: '/image', titleKey: 'navigation.image', icon: Sparkles },
  { href: '/assets', titleKey: 'navigation.assets', icon: Images },
  { href: '/prompts', titleKey: 'navigation.prompts', icon: FileText },
  { href: '/config', titleKey: 'navigation.config', icon: Settings2 },
]

function isNavActive(pathname: string, href: string) {
  if (href === '/canvas') {
    return pathname === '/canvas' || pathname.startsWith('/canvas/')
  }
  if (href === '/image') {
    return pathname === '/image' || pathname === '/video' || pathname.startsWith('/image/')
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
  const { systemName, logo } = useSystemConfig()
  const logoUrl = logo || DEFAULT_LOGO

  const items = useMemo(
    () =>
      LOCAL_NAV.map((link) => ({
        ...link,
        title: t(link.titleKey),
      })),
    [t]
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
      aria-label={t('topNav.navigation')}
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

      <nav className='mt-1 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
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
    </aside>
  )
}
