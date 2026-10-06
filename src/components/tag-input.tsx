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
import { X } from 'lucide-react'
import { useState, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface TagInputProps {
  value?: string[]
  onChange?: (tags: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function TagInput({
  value = [],
  onChange,
  placeholder,
  className,
  disabled = false,
}: TagInputProps) {
  const { t } = useTranslation()
  const placeholderText = placeholder ?? t('Add tags...')
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (raw: string) => {
    const next = [...value]
    for (const part of raw.split(/[,，;；]/)) {
      const trimmed = part.trim()
      if (trimmed && !next.includes(trimmed)) next.push(trimmed)
    }
    if (next.length !== value.length) onChange?.(next)
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    onChange?.(value.filter((tag) => tag !== tagToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter while an IME is composing confirms the candidate, not the tag.
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue)
    }
  }

  return (
    <div
      className={cn(
        'border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-9 w-full flex-wrap items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-within:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className='bg-muted text-foreground inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-2 text-xs leading-none'
        >
          <span className='truncate'>{tag}</span>
          {disabled ? null : (
            <button
              type='button'
              aria-label={t('Remove')}
              className='text-muted-foreground hover:text-foreground -mr-0.5 inline-flex shrink-0 items-center'
              onClick={(event) => {
                event.stopPropagation()
                removeTag(tag)
              }}
            >
              <X className='size-3' aria-hidden='true' />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type='text'
        value={inputValue}
        onChange={(e) => {
          const next = e.target.value
          if (/[,，;；]/.test(next)) addTag(next)
          else setInputValue(next)
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholderText : ''}
        disabled={disabled}
        className='placeholder:text-muted-foreground min-w-[120px] flex-1 border-0 bg-transparent shadow-none outline-none focus-visible:ring-0'
      />
    </div>
  )
}
