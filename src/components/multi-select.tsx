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
import { Select } from 'antd'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { cn } from '@/lib/utils'

export type Option = {
  label: string
  value: string
}

interface MultiSelectProps {
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  className?: string
  allowCreate?: boolean
  /**
   * Label shown for the "create" item in the dropdown.
   * Supports the `{{value}}` placeholder which is replaced with the typed input.
   * Falls back to `Add "{{value}}"` when omitted.
   */
  createLabel?: string
  /** Empty state text. Defaults to "No matching items". */
  emptyText?: string
  /** Optional `id` to wire labels/aria-describedby to the input. */
  id?: string
  /** Disable the entire control. */
  disabled?: boolean
  /**
   * Limits rendered chips while keeping all values selected.
   * Hidden values remain searchable/removable from the dropdown.
   */
  maxVisibleChips?: number
  /**
   * Replaces individual chips with a compact summary while preserving the
   * normal dropdown/search behaviour.
   */
  renderSelectedSummary?: (values: string[]) => React.ReactNode
  /**
   * When true, clicking a chip's label copies its value to the clipboard
   * instead of being inert. The remove (×) button keeps its own behaviour.
   */
  copyChipOnClick?: boolean
}

const COMMA_REGEX = /[,，\n]/

function splitDraft(value: string): { completed: string[]; draft: string } {
  if (!COMMA_REGEX.test(value)) {
    return { completed: [], draft: value }
  }
  const normalized = value.replaceAll('，', ',').replaceAll('\n', ',')
  const parts = normalized.split(',')
  const draft = parts.at(-1) ?? ''
  const completed = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean)
  return { completed, draft }
}

/**
 * MultiSelect — tags/chips style multi-select built on Ant Design Select.
 *
 * Behaviour:
 * - Search filters built-in options.
 * - When `allowCreate` is true, custom values can be added via tags mode:
 *   - Type and press Enter / "," to add a single value.
 *   - Paste a comma- (or newline-) separated list to add many at once.
 * - `maxVisibleChips` caps visible tags via `maxTagCount`.
 */
export function MultiSelect(props: MultiSelectProps) {
  const { t } = useTranslation()
  const placeholder = props.placeholder ?? t('Select items...')
  const [searchValue, setSearchValue] = React.useState('')

  const labelMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const option of props.options) {
      map.set(option.value, option.label)
    }
    for (const value of props.selected) {
      if (!map.has(value)) {
        map.set(value, value)
      }
    }
    return map
  }, [props.options, props.selected])

  const selectOptions = React.useMemo(() => {
    const seen = new Set<string>()
    const list: { label: string; value: string }[] = []
    for (const option of props.options) {
      if (seen.has(option.value)) continue
      seen.add(option.value)
      list.push({ label: option.label, value: option.value })
    }
    for (const value of props.selected) {
      if (seen.has(value)) continue
      seen.add(value)
      list.push({ label: labelMap.get(value) ?? value, value })
    }
    return list
  }, [props.options, props.selected, labelMap])

  const addValues = React.useCallback(
    (values: string[]) => {
      const next: string[] = []
      const seen = new Set<string>(props.selected)
      for (const raw of values) {
        const value = raw.trim()
        if (!value) continue
        if (seen.has(value)) continue
        seen.add(value)
        next.push(value)
      }
      if (next.length === 0) return
      props.onChange([...props.selected, ...next])
    },
    [props]
  )

  const handleSearch = (value: string) => {
    if (!props.allowCreate) {
      setSearchValue(value)
      return
    }
    const parsed = splitDraft(value)
    if (parsed.completed.length > 0) {
      addValues(parsed.completed)
      setSearchValue(parsed.draft)
      return
    }
    setSearchValue(value)
  }

  const handleChange = (values: string[]) => {
    props.onChange(values)
    setSearchValue('')
  }

  const handleCopyChip = React.useCallback(
    async (event: React.MouseEvent, value: string, label: string) => {
      event.preventDefault()
      event.stopPropagation()
      const ok = await copyToClipboard(value)
      if (ok) {
        toast.success(t('Copied: {{model}}', { model: label }))
      } else {
        toast.error(t('Failed to copy'))
      }
    },
    [t]
  )

  const maxTagCount =
    typeof props.maxVisibleChips === 'number'
      ? props.maxVisibleChips
      : undefined

  return (
    <Select
      id={props.id}
      mode={props.allowCreate ? 'tags' : 'multiple'}
      className={cn('w-full', props.className)}
      value={props.selected}
      onChange={handleChange}
      options={selectOptions}
      placeholder={placeholder}
      disabled={props.disabled}
      showSearch
      searchValue={searchValue}
      onSearch={handleSearch}
      allowClear
      maxTagCount={
        props.renderSelectedSummary
          ? 0
          : maxTagCount
      }
      maxTagPlaceholder={
        props.renderSelectedSummary
          ? () => (
              <span className='bg-muted text-muted-foreground flex h-[calc(--spacing(5.25))] w-fit items-center justify-center rounded-sm px-1.5 font-mono text-xs font-medium whitespace-nowrap'>
                {props.renderSelectedSummary?.(props.selected)}
              </span>
            )
          : (omitted) => t('+{{count}} more', { count: omitted.length })
      }
      tagRender={
        props.copyChipOnClick
          ? (tagProps) => {
              const label = labelMap.get(String(tagProps.value)) ?? String(tagProps.value)
              return (
                <span
                  className='ant-select-selection-item'
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                >
                  <button
                    type='button'
                    className='ant-select-selection-item-content max-w-[16rem] cursor-pointer truncate hover:underline'
                    title={t('Click to copy')}
                    onClick={(event) =>
                      handleCopyChip(event, String(tagProps.value), label)
                    }
                  >
                    {label}
                  </button>
                  <span
                    className='ant-select-selection-item-remove'
                    onClick={tagProps.onClose}
                    role='button'
                    tabIndex={-1}
                  >
                    ×
                  </span>
                </span>
              )
            }
          : undefined
      }
      notFoundContent={props.emptyText ?? t('No matching items')}
      optionFilterProp='label'
      tokenSeparators={props.allowCreate ? [',', '，', '\n'] : undefined}
    />
  )
}
