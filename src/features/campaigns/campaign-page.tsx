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
import { CalendarX2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HtmlContent } from '@/components/html-content'
import { SectionPageLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'

import { getActiveCampaign } from './api'
import { CAMPAIGNS_QUERY_KEY } from './hooks'

export function CampaignPage(props: { slug: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: [...CAMPAIGNS_QUERY_KEY, 'page', props.slug],
    queryFn: () => getActiveCampaign(props.slug),
    staleTime: 60_000,
  })
  const campaign = query.data

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {campaign?.title ?? t('Campaigns')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {query.isLoading ? (
          <div className='mx-auto w-full max-w-6xl space-y-4'>
            <Skeleton className='h-32 w-full rounded-2xl' />
            <Skeleton className='h-64 w-full rounded-2xl' />
          </div>
        ) : campaign ? (
          <HtmlContent
            variant='isolated'
            content={campaign.content}
            className='mx-auto max-w-6xl pb-2'
          />
        ) : (
          <div className='text-muted-foreground mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center'>
            <CalendarX2 className='size-10 opacity-60' />
            <h3 className='text-foreground text-lg font-semibold'>
              {t('This campaign has ended')}
            </h3>
            <p className='text-sm'>{t('Stay tuned for upcoming campaigns.')}</p>
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
