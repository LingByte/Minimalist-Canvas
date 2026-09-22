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
import { HelpCircle, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { RichContent } from '@/components/rich-content'
import { useFAQ } from '@/features/dashboard/hooks/use-status-data'
import type { FAQItem } from '@/features/dashboard/types'

import { IconBadge } from '../ui/icon-badge'
import { PanelWrapper } from '../ui/panel-wrapper'

export function FAQPanel() {
  const { t } = useTranslation()
  const { items: list, loading } = useFAQ()

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <IconBadge tone='chart-4' size='sm'>
            <HelpCircle />
          </IconBadge>
          {t('FAQ')}
        </span>
      }
      description={t('Answers for common access and billing questions')}
      loading={loading}
      empty={!list.length}
      emptyMessage={t('No FAQ entries available')}
      height='h-80'
      contentClassName='p-0'
      headerActions={
        <Link
          to='/faq'
          className='text-primary text-xs font-medium hover:underline'
        >
          {t('View all')}
        </Link>
      }
    >
      <div className='h-80 overflow-y-auto'>
        <ul className='divide-border divide-y'>
          {list.map((item: FAQItem, idx: number) => {
            const key = String(item.id ?? `faq-${idx}`)
            return (
              <li key={key}>
                <Link
                  to={`/faq/${key}`}
                  className='hover:bg-muted/50 flex items-start gap-2 px-4 py-3 transition-colors sm:px-5'
                >
                  <div className='min-w-0 flex-1'>
                    <RichContent
                      breaks
                      content={item.question}
                      className='text-sm leading-relaxed font-semibold'
                    />
                  </div>
                  <ChevronRight className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </PanelWrapper>
  )
}
