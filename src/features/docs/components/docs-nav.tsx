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
import { Link } from 'react-router-dom'
import { Input } from 'antd'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  DOCS_GROUPS,
  DOCS_SECTIONS,
  type DocsSectionId,
} from '../lib/sections'
import { HttpMethodBadge } from './http-method-badge'

type DocsNavProps = {
  activeId: DocsSectionId
  onNavigate?: () => void
}

export function DocsNav(props: DocsNavProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return DOCS_SECTIONS.filter((section) => {
      if (!normalized) return true
      const title = t(section.titleKey).toLowerCase()
      const description = t(section.descriptionKey).toLowerCase()
      const path = section.path?.toLowerCase() ?? ''
      return (
        title.includes(normalized) ||
        description.includes(normalized) ||
        path.includes(normalized) ||
        section.id.includes(normalized)
      )
    })
  }, [query, t])

  return (
    <div className='flex h-full flex-col'>
      <div className='relative px-3 pt-4 pb-3'>
        <Search className='text-muted-foreground pointer-events-none absolute top-6 left-5 size-3.5' />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('docs.search')}
          className='h-8 pl-8 text-sm'
          allowClear
        />
      </div>
      <nav className='flex-1 space-y-5 overflow-y-auto px-3 pb-6'>
        {DOCS_GROUPS.map((group) => {
          const items = filtered.filter((section) => section.group === group.id)
          if (items.length === 0) return null
          return (
            <div key={group.id}>
              <p className='text-muted-foreground mb-1.5 px-2 text-[11px] font-semibold tracking-[0.08em] uppercase'>
                {t(group.titleKey)}
              </p>
              <ul className='space-y-0.5'>
                {items.map((item) => {
                  const isActive = item.id === props.activeId
                  return (
                    <li key={item.id}>
                      <Link
                        to={`/docs/${item.id}`}
                        onClick={props.onNavigate}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {item.method ? (
                          <HttpMethodBadge method={item.method} />
                        ) : null}
                        <span className='min-w-0 truncate'>
                          {t(item.titleKey)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className='text-muted-foreground px-2 text-sm'>
            {t('docs.noResults')}
          </p>
        ) : null}
      </nav>
    </div>
  )
}
