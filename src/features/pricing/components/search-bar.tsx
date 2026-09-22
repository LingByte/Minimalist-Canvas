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
import { Input } from 'antd'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder?: string
  className?: string
  size?: 'middle' | 'large' | 'small'
}

export function SearchBar(props: SearchBarProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={props.className}>
      <Input.Search
        ref={inputRef as never}
        allowClear
        size={props.size ?? 'large'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onSearch={(value) => props.onChange(value)}
        onClear={props.onClear}
        placeholder={props.placeholder || t('Search models...')}
        aria-label={t('Search models')}
      />
    </div>
  )
}
