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
import { LayoutGroup } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  siteHeaderActionsClassName,
  siteHeaderChromeClassName,
  siteHeaderInnerClassName,
  siteHeaderNavTrackClassName,
} from '../utils/top-nav-link-styles'

export type SiteHeaderProps = {
  brand?: React.ReactNode | null
  /** Desktop nav items (already wrapped as links/buttons) */
  nav: React.ReactNode
  /** Right-side desktop actions */
  actions: React.ReactNode
  /** Mobile hamburger / controls shown only below md */
  mobileTrigger?: React.ReactNode
  /** Full-screen mobile panel */
  mobilePanel?: React.ReactNode
  mobileOpen?: boolean
  navAriaLabel?: string
  /** Stable id for LayoutGroup so active pill can spring between items */
  navLayoutGroupId?: string
  className?: string
}

/**
 * Shared top bar shell used by the public site header and the canvas AppTopNav.
 * Layout + visual language live here; callers only supply brand / nav / actions.
 */
export function SiteHeader(props: SiteHeaderProps) {
  const { t } = useTranslation()

  return (
    <>
      <header className={cn(siteHeaderChromeClassName, props.className)}>
        <div className={siteHeaderInnerClassName}>
          <div className='flex min-w-0 flex-1 items-center gap-3 sm:gap-4'>
            {props.brand ? props.brand : null}

            {props.mobileTrigger ? (
              <div className='flex shrink-0 md:hidden'>{props.mobileTrigger}</div>
            ) : null}

            <LayoutGroup id={props.navLayoutGroupId || 'site-header-nav'}>
              <nav
                aria-label={props.navAriaLabel || t('Primary')}
                className={cn(siteHeaderNavTrackClassName, 'hidden md:flex')}
              >
                {props.nav}
              </nav>
            </LayoutGroup>
          </div>

          <div className={siteHeaderActionsClassName}>{props.actions}</div>
        </div>
      </header>

      {props.mobilePanel}
    </>
  )
}
