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
import { Button, Skeleton } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandIdentity } from '@/components/layout/components/brand-identity'
import { SiteHeader } from '@/components/layout/components/site-header'
import { SiteHeaderNavItemContent } from '@/components/layout/components/site-header-nav-item'
import type { TopNavLink } from '@/components/layout/types'
import {
  SITE_HEADER_NAV_PILL_LAYOUT_ID,
  siteHeaderBrandClassName,
  siteHeaderDividerClassName,
  siteHeaderNavItemLinkClassName,
} from '@/components/layout/utils/top-nav-link-styles'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { useDesktopSiteNavLinks } from '@/hooks/use-desktop-site-nav-links'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  showAuthButtons?: boolean
  /** Hide the horizontal nav on md+ when a vertical site sidebar is present. */
  hideDesktopNav?: boolean
  /** Hide header brand/logo (sidebar owns branding in app shell). */
  hideBrand?: boolean
  className?: string
}

function isNavLinkActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/home'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    hideDesktopNav = false,
    hideBrand = false,
    className,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { auth } = useAuthStore()
  const { systemName, logo: systemLogo, loading } = useSystemConfig()
  const dynamicLinks = useDesktopSiteNavLinks()

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName

  const links = useMemo(
    () => (navLinks && navLinks.length > 0 ? navLinks : dynamicLinks),
    [dynamicLinks, navLinks]
  )

  const renderNavLink = (
    link: TopNavLink,
    options: {
      key: string | number
      active: boolean
      compact?: boolean
      className?: string
      closeMobile?: boolean
    }
  ) => {
    const className = cn(
      siteHeaderNavItemLinkClassName({
        active: options.active,
        highlight: !!link.highlight,
        compact: options.compact,
      }),
      options.className
    )

    const label = (
      <SiteHeaderNavItemContent
        active={options.active}
        highlight={!!link.highlight}
        compact={options.compact}
        layoutId={SITE_HEADER_NAV_PILL_LAYOUT_ID}
      >
        {link.title}
      </SiteHeaderNavItemContent>
    )

    return (
      <Link
        key={options.key}
        to={link.href}
        aria-disabled={link.disabled}
        tabIndex={link.disabled ? -1 : undefined}
        onClick={() => {
          if (options.closeMobile) setMobileOpen(false)
        }}
        className={className}
      >
        {label}
      </Link>
    )
  }

  let brandContent: React.ReactNode
  if (loading) {
    brandContent = <BrandIdentity loading size='sm' showTagline={false} />
  } else if (customLogo) {
    brandContent = (
      <div className='flex items-center gap-2.5'>
        {customLogo}
        <BrandIdentity name={displaySiteName} showTagline={false} size='sm' />
      </div>
    )
  } else {
    brandContent = (
      <BrandIdentity
        logo={systemLogo}
        name={displaySiteName}
        showTagline={false}
        size='sm'
      />
    )
  }

  let authContent: React.ReactNode = null
  if (showAuthButtons) {
    if (loading) {
      authContent = (
        <Skeleton.Button active size='small' style={{ width: 80 }} />
      )
    } else if (isAuthenticated) {
      authContent = <ProfileDropdown />
    } else {
      authContent = (
        <Link to='/sign-in'>
          <Button
            type='primary'
            size='small'
            className='h-8 rounded-full px-3.5 text-xs font-medium'
          >
            {t('Sign in')}
          </Button>
        </Link>
      )
    }
  }

  const brand = hideBrand ? null : (
    <Link to={homeUrl} className={siteHeaderBrandClassName}>
      {brandContent}
    </Link>
  )

  const nav = hideDesktopNav ? null : (
    <>
      {links.map((link, i) =>
        renderNavLink(link, {
          key: `${link.href}-${i}`,
          active: isNavLinkActive(pathname, link.href),
        })
      )}
    </>
  )

  const actions = (
    <>
      <div className='hidden items-center gap-1.5 sm:flex'>
        {showLanguageSwitcher ? <LanguageSwitcher /> : null}
        {showThemeSwitch ? <ThemeSwitch /> : null}
        {!hideDesktopNav && (showLanguageSwitcher || showThemeSwitch) ? (
          <span aria-hidden className={siteHeaderDividerClassName} />
        ) : null}
        {hideDesktopNav ? null : authContent}
      </div>

      <div className='flex items-center gap-1.5 sm:hidden'>
        {showLanguageSwitcher ? <LanguageSwitcher /> : null}
        {showThemeSwitch ? <ThemeSwitch /> : null}
        {showAuthButtons && !loading && isAuthenticated ? (
          <ProfileDropdown />
        ) : null}
        {showAuthButtons && !loading && !isAuthenticated ? (
          <Link to='/sign-in'>
            <Button
              type='primary'
              size='small'
              className='h-8 rounded-full px-3 text-xs font-medium'
            >
              {t('Sign in')}
            </Button>
          </Link>
        ) : null}
      </div>
    </>
  )

  const mobileTrigger = (
    <button
      type='button'
      className='inline-flex size-8 items-center justify-center rounded-full text-foreground transition hover:bg-foreground/[0.06]'
      onClick={() => setMobileOpen((v) => !v)}
      aria-label={t('Toggle navigation menu')}
      aria-expanded={mobileOpen}
    >
      <span className='relative size-4'>
        <span
          className={cn(
            'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
            mobileOpen ? 'top-[7px] rotate-45' : 'top-[3px]'
          )}
        />
        <span
          className={cn(
            'absolute inset-x-0 top-[7px] block h-[1.5px] rounded-full bg-current transition-all duration-300',
            mobileOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
          )}
        />
        <span
          className={cn(
            'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
            mobileOpen ? 'top-[7px] -rotate-45' : 'top-[11px]'
          )}
        />
      </span>
    </button>
  )

  const mobilePanel = (
    <div
      className={cn(
        'bg-background/98 fixed inset-0 z-40 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:pointer-events-none md:hidden',
        mobileOpen
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      )}
    >
      <div className='flex h-full flex-col justify-between px-6 pt-20 pb-10'>
        <nav aria-label={t('Primary')} className='flex flex-col gap-1'>
          {links.map((link, i) =>
            renderNavLink(link, {
              key: `mobile-${link.href}-${i}`,
              active: isNavLinkActive(pathname, link.href),
              compact: true,
              closeMobile: true,
              className: cn(
                'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                mobileOpen
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-4 opacity-0'
              ),
            })
          )}
        </nav>

        {showAuthButtons ? (
          <div
            className={cn(
              'transition-all duration-500',
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0'
            )}
          >
            {isAuthenticated ? (
              <button
                type='button'
                onClick={() => {
                  setMobileOpen(false)
                  navigate('/dashboard')
                }}
                className='bg-foreground text-background inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium transition-opacity hover:opacity-90'
              >
                {t('Go to Dashboard')}
              </button>
            ) : (
              <Link
                to='/sign-in'
                onClick={() => setMobileOpen(false)}
                className='bg-foreground text-background inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium transition-opacity hover:opacity-90'
              >
                {t('Sign in')}
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <SiteHeader
      className={className}
      brand={brand}
      nav={nav}
      actions={actions}
      mobileTrigger={mobileTrigger}
      mobilePanel={mobilePanel}
      mobileOpen={mobileOpen}
      navLayoutGroupId='site-header-nav'
    />
  )
}
