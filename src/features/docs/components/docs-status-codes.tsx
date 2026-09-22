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
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { DOCS_STATUS_CODES } from '../lib/docs-status-codes'

type DocsStatusCodesProps = {
  className?: string
}

export function DocsStatusCodes(props: DocsStatusCodesProps) {
  const { t } = useTranslation()
  const [openCode, setOpenCode] = useState<number | null>(401)

  return (
    <section id='responses' className={cn('mb-10 scroll-mt-24', props.className)}>
      <div className='mb-3'>
        <h2 className='text-foreground m-0 text-base font-semibold'>
          {t('docs.status.title')}
        </h2>
        <p className='text-muted-foreground mt-1 mb-0 text-sm'>
          {t('docs.status.subtitle')}
        </p>
      </div>

      <div className='border-border/80 bg-card divide-border/70 divide-y overflow-hidden rounded-xl border'>
        {DOCS_STATUS_CODES.map((item) => {
          const open = openCode === item.code
          return (
            <div key={item.code}>
              <button
                type='button'
                className='hover:bg-muted/30 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors'
                aria-expanded={open}
                onClick={() =>
                  setOpenCode((current) =>
                    current === item.code ? null : item.code
                  )
                }
              >
                <ChevronRight
                  className={cn(
                    'text-muted-foreground size-4 shrink-0 transition-transform',
                    open && 'rotate-90'
                  )}
                />
                <span className='text-foreground w-10 shrink-0 font-mono text-sm font-semibold tabular-nums'>
                  {item.code}
                </span>
                <span className='text-foreground truncate text-sm font-medium'>
                  {t(item.titleKey)}
                </span>
              </button>

              {open ? (
                <div className='border-border/60 space-y-4 border-t px-4 pt-3 pb-4'>
                  <p className='text-muted-foreground m-0 text-sm leading-relaxed'>
                    {t(item.descriptionKey)}
                  </p>

                  {item.headers && item.headers.length > 0 ? (
                    <div>
                      <p className='text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase'>
                        {t('docs.status.responseHeaders')}
                      </p>
                      <ul className='divide-border/70 border-border/70 divide-y rounded-lg border'>
                        {item.headers.map((header) => (
                          <li
                            key={header.name}
                            className='flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:gap-3'
                          >
                            <code className='text-foreground shrink-0 font-mono text-[13px]'>
                              {header.name}
                            </code>
                            <span className='text-muted-foreground text-sm'>
                              {t(header.descriptionKey)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <p className='text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase'>
                      {t('docs.status.responseBody')}
                    </p>
                    <ul className='divide-border/70 border-border/70 divide-y rounded-lg border'>
                      {item.fields.map((field) => (
                        <li key={field.name} className='space-y-1 px-3 py-2.5'>
                          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                            <code className='text-foreground font-mono text-[13px] font-medium'>
                              {field.name}
                            </code>
                            <span className='text-muted-foreground font-mono text-[12px]'>
                              {field.type}
                            </span>
                            {field.required ? (
                              <span className='text-[11px] font-semibold text-orange-600 dark:text-orange-400'>
                                {t('docs.status.required')}
                              </span>
                            ) : null}
                          </div>
                          <p className='text-muted-foreground m-0 text-sm leading-relaxed'>
                            {t(field.descriptionKey)}
                          </p>
                          {field.example ? (
                            <p className='text-muted-foreground m-0 font-mono text-[12px]'>
                              {t('docs.status.example')}:{' '}
                              <span className='text-foreground'>
                                {field.example}
                              </span>
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
