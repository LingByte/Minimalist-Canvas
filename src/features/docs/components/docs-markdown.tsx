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
import { useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Markdown } from '@/components/ui/markdown'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

import { slugifyHeading, type DocsHeading } from '../lib/parse-markdown'

const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'

const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

type DocsMarkdownProps = {
  content: string
  headings: DocsHeading[]
  className?: string
}

export function DocsMarkdown(props: DocsMarkdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const copyLabel = t('docs.copy')
  const copiedLabel = t('docs.copied')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    root.querySelectorAll('h2, h3').forEach((node, index) => {
      const mapped = props.headings[index]
      const fallback =
        slugifyHeading(node.textContent ?? '') || `heading-${index}`
      node.id = mapped?.id ?? fallback
      node.classList.add('scroll-mt-24')
    })

    root.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') ?? ''
      if (href.startsWith('http://') || href.startsWith('https://')) return
      link.removeAttribute('target')
      link.removeAttribute('rel')
    })

    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.parentElement?.classList.contains('docs-code-wrap')) return

      const wrap = document.createElement('div')
      wrap.className = 'docs-code-wrap group/code relative'
      pre.parentNode?.insertBefore(wrap, pre)
      wrap.appendChild(pre)

      const button = document.createElement('button')
      button.type = 'button'
      button.className =
        'absolute top-2.5 right-2.5 inline-flex size-8 items-center justify-center rounded-md border border-border/80 bg-background/90 text-muted-foreground opacity-0 shadow-xs backdrop-blur-sm transition-opacity hover:text-foreground group-hover/code:opacity-100 focus-visible:opacity-100'
      button.setAttribute('aria-label', copyLabel)
      button.innerHTML = COPY_ICON
      wrap.appendChild(button)

      button.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        void copyToClipboard(code).then((ok) => {
          if (!ok) return
          button.setAttribute('aria-label', copiedLabel)
          button.innerHTML = CHECK_ICON
          window.setTimeout(() => {
            button.setAttribute('aria-label', copyLabel)
            button.innerHTML = COPY_ICON
          }, 1600)
        })
      })
    })
  }, [copyLabel, copiedLabel, props.content, props.headings])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest('a[href]')
      if (!target) return
      const href = target.getAttribute('href')
      if (!href?.startsWith('/docs')) return
      event.preventDefault()
      const [pathname, hash] = href.split('#')
      const parts = pathname.split('/').filter(Boolean)
      const section = parts[1]
      if (!section) {
        void navigate('/docs')
        return
      }
      void navigate(`/docs/${section}${hash ? `#${hash}` : ''}`)
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [navigate, props.content])

  return (
    <div ref={rootRef} className={cn('docs-prose', props.className)}>
      <Markdown className='max-w-none'>{props.content}</Markdown>
    </div>
  )
}
