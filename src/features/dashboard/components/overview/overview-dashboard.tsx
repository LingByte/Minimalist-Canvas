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
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { useDashboardContentVisibility } from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { FAQPanel } from './faq-panel'
import { PerformanceHealthPanel } from './performance-health-panel'

export function OverviewDashboard() {
  const user = useAuthStore((state) => state.auth.user)
  const {
    announcements: showAnnouncementsPanel,
    faq: showFAQPanel,
  } = useDashboardContentVisibility()

  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const showContentPanels =
    isAdmin || showAnnouncementsPanel || showFAQPanel

  return (
    <div className='flex flex-col gap-4'>
      {showContentPanels ? (
        <div data-overview-tour='panels'>
          <CardStaggerContainer className='grid grid-cols-1 gap-4'>
            <div
              className={cn(
                'grid min-w-0 grid-cols-1 gap-4',
                (showAnnouncementsPanel || showFAQPanel) && 'lg:grid-cols-2'
              )}
            >
              {isAdmin && (
                <CardStaggerItem className='lg:col-span-2'>
                  <PerformanceHealthPanel />
                </CardStaggerItem>
              )}
              {showAnnouncementsPanel && (
                <CardStaggerItem>
                  <AnnouncementsPanel />
                </CardStaggerItem>
              )}
              {showFAQPanel && (
                <CardStaggerItem>
                  <FAQPanel />
                </CardStaggerItem>
              )}
            </div>
          </CardStaggerContainer>
        </div>
      ) : null}
    </div>
  )
}
