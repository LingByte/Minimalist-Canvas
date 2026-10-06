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
import { useQuery } from '@tanstack/react-query'

import { useStatus } from '@/hooks/use-status'

import { listActiveCampaigns } from './api'
import type { Campaign, HomeCampaign } from './types'

const NO_HOME_CAMPAIGNS: HomeCampaign[] = []
const NO_CAMPAIGNS: Campaign[] = []

export const CAMPAIGNS_QUERY_KEY = ['campaigns'] as const

/** Home carousel slides that are enabled and inside their schedule. */
export function useHomeCampaigns(): HomeCampaign[] {
  const { status } = useStatus()
  const raw = status?.home_campaigns
  return Array.isArray(raw) ? (raw as HomeCampaign[]) : NO_HOME_CAMPAIGNS
}

/** Campaign pages that are currently running (without their HTML body). */
export function useActiveCampaignsQuery() {
  return useQuery({
    queryKey: [...CAMPAIGNS_QUERY_KEY, 'active'],
    queryFn: listActiveCampaigns,
    staleTime: 60_000,
  })
}

export function useActiveCampaigns() {
  return useActiveCampaignsQuery().data ?? NO_CAMPAIGNS
}
