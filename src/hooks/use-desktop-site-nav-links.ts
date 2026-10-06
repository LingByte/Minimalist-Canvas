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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { TopNavLink } from '@/components/layout/types'
import { useActiveCampaigns } from '@/features/campaigns/hooks'

/**
 * Desktop site nav — mirrors the web console sidebar product destinations.
 * Canvas is an in-app route here (not an external tab).
 */
export function useDesktopSiteNavLinks(): TopNavLink[] {
  const { t } = useTranslation()
  const campaigns = useActiveCampaigns()

  return useMemo(
    () => [
      { title: t('Home'), href: '/home' },
      { title: t('Console'), href: '/dashboard' },
      { title: t('Common Logs'), href: '/usage-logs/common' },
      { title: t('Task Logs'), href: '/usage-logs/task' },
      { title: t('Canvas'), href: '/canvas' },
      { title: t('Generation Records'), href: '/generation-logs' },
      { title: t('Prompt library'), href: '/prompt-library' },
      { title: t('Creative Circle'), href: '/creative-circle' },
      ...campaigns.map((campaign) => ({
        title: campaign.title,
        href: `/campaigns/${campaign.slug}`,
      })),
      { title: t('Model Square'), href: '/pricing' },
      { title: t('Docs'), href: '/docs' },
      { title: t('FAQ'), href: '/faq' },
    ],
    [campaigns, t]
  )
}
