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
import { Input, Select, Tag, Typography } from 'antd'
import { Copy } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CHANNEL_TYPES } from '@/features/channels/constants'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

import type { PublicVoice } from '../types'

export type VoiceCardGridProps = {
  voices: PublicVoice[]
  className?: string
}

function genderLabel(gender: string | undefined, t: (k: string) => string) {
  switch ((gender || '').toLowerCase()) {
    case 'male':
      return t('Male')
    case 'female':
      return t('Female')
    case 'neutral':
      return t('Neutral')
    default:
      return ''
  }
}

export const VoiceCardGrid = memo(function VoiceCardGrid(
  props: VoiceCardGridProps
) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const [keyword, setKeyword] = useState('')
  const [vendor, setVendor] = useState<string>('all')

  const vendorOptions = useMemo(() => {
    const set = new Set(props.voices.map((v) => v.vendor))
    return [...set].sort((a, b) => a - b)
  }, [props.voices])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return props.voices.filter((v) => {
      if (vendor !== 'all' && v.vendor !== Number(vendor)) return false
      if (!q) return true
      return (
        v.voice_id.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.category || '').toLowerCase().includes(q)
      )
    })
  }, [props.voices, keyword, vendor])

  return (
    <div className={cn('space-y-4', props.className)}>
      <div className='flex flex-col gap-3 sm:flex-row'>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('Search voice id / name')}
          className='sm:max-w-sm'
          allowClear
        />
        <Select
          className='sm:w-48'
          value={vendor}
          onChange={(value) => setVendor(value)}
          options={[
            { value: 'all', label: t('All vendors') },
            ...vendorOptions.map((id) => ({
              value: String(id),
              label: CHANNEL_TYPES[id as keyof typeof CHANNEL_TYPES]
                ? t(CHANNEL_TYPES[id as keyof typeof CHANNEL_TYPES])
                : String(id),
            })),
          ]}
          showSearch
          optionFilterProp='label'
        />
      </div>

      {filtered.length === 0 ? (
        <p className='text-muted-foreground py-12 text-center text-sm'>
          {t('No voices found')}
        </p>
      ) : (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {filtered.map((voice) => {
            const vendorName = CHANNEL_TYPES[
              voice.vendor as keyof typeof CHANNEL_TYPES
            ]
              ? t(CHANNEL_TYPES[voice.vendor as keyof typeof CHANNEL_TYPES])
              : String(voice.vendor)
            const gender = genderLabel(voice.gender, t)
            return (
              <article
                key={voice.voice_id}
                className='bg-card/60 hover:bg-card border-border/60 rounded-xl border p-4 transition-colors'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <Typography.Title
                      level={5}
                      style={{ margin: 0 }}
                      ellipsis
                    >
                      {voice.name}
                    </Typography.Title>
                    <button
                      type='button'
                      className='text-muted-foreground hover:text-foreground mt-1 flex max-w-full items-center gap-1 font-mono text-xs'
                      onClick={() => {
                        void copyToClipboard(voice.voice_id)
                      }}
                      title={t('Copy')}
                    >
                      <span className='truncate'>{voice.voice_id}</span>
                      <Copy className='size-3 shrink-0 opacity-60' />
                    </button>
                  </div>
                  <Tag className='m-0 shrink-0'>{vendorName}</Tag>
                </div>
                <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
                  {voice.description ||
                    [gender, voice.category, voice.locale]
                      .filter(Boolean)
                      .join(' · ') ||
                    '—'}
                </p>
                <div className='mt-3 flex flex-wrap gap-1.5'>
                  {gender ? <Tag color='blue'>{gender}</Tag> : null}
                  {voice.category ? <Tag>{voice.category}</Tag> : null}
                  {voice.locale ? <Tag>{voice.locale}</Tag> : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
})
