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
import type { IconType } from 'react-icons'
import {
  SiCurl,
  SiGo,
  SiJavascript,
  SiOpenjdk,
  SiPython,
} from 'react-icons/si'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundledLanguage } from 'shiki/bundle/web'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { cn } from '@/lib/utils'

import { buildDocsCodeSamples } from '../lib/docs-code-samples'
import type { DocsEndpoint } from '../lib/parse-markdown'

type DocsCodeSamplesProps = {
  endpoint: DocsEndpoint
  markdown: string
  className?: string
}

const SAMPLE_ICONS: Record<string, IconType> = {
  curl: SiCurl,
  python: SiPython,
  javascript: SiJavascript,
  go: SiGo,
  java: SiOpenjdk,
}

const SAMPLE_HIGHLIGHT: Record<string, BundledLanguage> = {
  curl: 'bash',
  python: 'python',
  javascript: 'javascript',
  go: 'go',
  java: 'java',
}

export function DocsCodeSamples(props: DocsCodeSamplesProps) {
  const { t } = useTranslation()
  const samples = useMemo(
    () =>
      buildDocsCodeSamples({
        endpoint: props.endpoint,
        markdown: props.markdown,
      }),
    [props.endpoint, props.markdown]
  )
  const [activeId, setActiveId] = useState(samples[0]?.id ?? 'curl')
  const active = samples.find((sample) => sample.id === activeId) ?? samples[0]

  if (!active) return null

  return (
    <section className={cn('mb-8', props.className)}>
      <div className='mb-3'>
        <h2 className='text-foreground m-0 text-base font-semibold'>
          {t('docs.codeSamples.title')}
        </h2>
        <p className='text-muted-foreground mt-1 mb-0 text-sm'>
          {t('docs.codeSamples.subtitle')}
        </p>
      </div>

      <div className='border-border/80 bg-card overflow-hidden rounded-xl border'>
        <div
          role='tablist'
          aria-label={t('docs.codeSamples.title')}
          className='border-border/70 flex flex-wrap gap-1 border-b px-2 pt-2'
        >
          {samples.map((sample) => {
            const selected = sample.id === active.id
            const Icon = SAMPLE_ICONS[sample.id]
            return (
              <button
                key={sample.id}
                type='button'
                role='tab'
                aria-selected={selected}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition-colors',
                  selected
                    ? 'text-foreground border-border/80 bg-muted/50 border border-b-transparent'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                )}
                onClick={() => setActiveId(sample.id)}
              >
                {Icon ? (
                  <Icon className='size-3.5 shrink-0' aria-hidden />
                ) : null}
                <span>{sample.label}</span>
              </button>
            )
          })}
        </div>

        <div className='bg-muted/20 p-3'>
          <CodeBlock
            key={`${active.id}:${active.code.length}`}
            code={active.code}
            language={SAMPLE_HIGHLIGHT[active.id] ?? active.language}
            enableCollapse={false}
            className='my-0 border-0 bg-transparent shadow-none'
          >
            <CodeBlockCopyButton />
          </CodeBlock>
        </div>
      </div>
    </section>
  )
}
