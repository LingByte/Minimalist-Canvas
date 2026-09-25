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
import { BookOpen, Search, Terminal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  DOCS_GROUPS,
  DOCS_SECTIONS,
  type DocsGroupId,
  type DocsSectionId,
} from '../lib/sections'
import { HttpMethodBadge } from './http-method-badge'

type DocsNavProps = {
  activeId: DocsSectionId
  onNavigate?: () => void
}

const GROUP_ICON: Record<DocsGroupId, typeof BookOpen> = {
  guides: BookOpen,
  reference: Terminal,
}

export function DocsNav(props: DocsNavProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const navRef = useRef<HTMLElement>(null)

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

  useEffect(() => {
    const scroller = navRef.current
    if (!scroller) return
    const link = scroller.querySelector<HTMLElement>(
      `[data-docs-nav-id="${props.activeId}"]`
    )
    if (!link) return

    const linkRect = link.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const fullyVisible =
      linkRect.top >= scrollerRect.top + 8 &&
      linkRect.bottom <= scrollerRect.bottom - 8
    if (fullyVisible) return

    link.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [props.activeId])

  return (
    <div className='flex h-full flex-col'>
      <div className='border-border/40 border-b px-3.5 pt-4 pb-3.5'>
        <p className='text-foreground mb-0.5 text-[13px] font-semibold tracking-tight'>
          {t('docs.title')}
        </p>
        <p className='text-muted-foreground mb-3 text-[11.5px] leading-relaxed'>
          {t('docs.nav.subtitle')}
        </p>
        <label className='relative block'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2'
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('docs.search')}
            className='h-8 pl-8 text-[12.5px]'
            allowClear
            aria-label={t('docs.search')}
          />
        </label>
      </div>

      <nav ref={navRef} className='flex-1 space-y-5 overflow-y-auto px-2.5 py-3.5'>
        {DOCS_GROUPS.map((group) => {
          const items = filtered.filter((section) => section.group === group.id)
          if (items.length === 0) return null
          const Icon = GROUP_ICON[group.id]
          return (
            <div key={group.id}>
              <div className='text-muted-foreground mb-1.5 flex items-center gap-1.5 px-2'>
                <Icon className='size-3 opacity-70' aria-hidden />
                <p className='text-[10.5px] font-semibold tracking-[0.14em] uppercase'>
                  {t(group.titleKey)}
                </p>
              </div>
              <ul className='space-y-px'>
                {items.map((item, index) => {
                  const isActive = item.id === props.activeId
                  const isGuide = group.id === 'guides'
                  return (
                    <li key={item.id}>
                      <Link
                        to={`/docs/${item.id}`}
                        data-docs-nav-id={item.id}
                        onClick={props.onNavigate}
                        className={cn(
                          'group relative flex items-start gap-2 rounded-md px-2 py-[7px] text-[12.5px] transition-colors',
                          isActive
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground'
                        )}
                      >
                        {isActive ? (
                          <span
                            aria-hidden
                            className='bg-foreground absolute inset-y-1.5 left-0 w-[2px] rounded-full'
                          />
                        ) : null}
                        {isGuide ? (
                          <span
                            className={cn(
                              'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold',
                              isActive
                                ? 'bg-foreground text-background'
                                : 'bg-muted text-muted-foreground group-hover:bg-background'
                            )}
                          >
                            {index + 1}
                          </span>
                        ) : item.method ? (
                          <HttpMethodBadge
                            method={item.method}
                            className='mt-0.5 shrink-0'
                          />
                        ) : null}
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate font-medium leading-5'>
                            {t(item.titleKey)}
                          </span>
                          {item.path ? (
                            <span className='text-muted-foreground/75 mt-0.5 block truncate font-mono text-[10.5px]'>
                              {item.path}
                            </span>
                          ) : null}
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
