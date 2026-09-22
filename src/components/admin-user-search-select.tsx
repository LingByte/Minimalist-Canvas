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
import { useQuery } from '@tanstack/react-query'
import { Select } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getUsers, searchUsers } from '@/features/users/api'
import type { User } from '@/features/users/types'

type AdminUserSearchSelectProps = {
  value?: number
  onChange: (userId: number | undefined, label: string) => void
  className?: string
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
}

function formatUserLabel(user: User) {
  const name = user.display_name || user.username
  return `${name} (#${user.id})`
}

export function AdminUserSearchSelect({
  value,
  onChange,
  className = 'min-w-64',
  placeholder,
  size = 'middle',
}: AdminUserSearchSelectProps) {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [selectedLabel, setSelectedLabel] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const usersQuery = useQuery({
    queryKey: ['admin-user-search-select', debouncedKeyword],
    queryFn: async () => {
      const response = debouncedKeyword
        ? await searchUsers({
            keyword: debouncedKeyword,
            p: 1,
            page_size: 50,
            sort_by: 'id',
            sort_order: 'desc',
          })
        : await getUsers({
            p: 1,
            page_size: 50,
            sort_by: 'id',
            sort_order: 'desc',
          })
      if (!response.success) {
        throw new Error(response.message || t('Failed to load users'))
      }
      return response.data?.items || []
    },
    staleTime: 30_000,
  })

  const options = useMemo(() => {
    const next = (usersQuery.data || []).map((user) => ({
      value: user.id,
      label: formatUserLabel(user),
    }))
    if (value && !next.some((item) => item.value === value)) {
      next.unshift({
        value,
        label: selectedLabel || `#${value}`,
      })
    }
    return next
  }, [usersQuery.data, value, selectedLabel])

  return (
    <Select
      className={className}
      size={size}
      showSearch
      allowClear
      optionFilterProp='label'
      filterOption={false}
      placeholder={placeholder || t('Search by ID or username')}
      value={value}
      options={options}
      loading={usersQuery.isFetching}
      onSearch={setSearchInput}
      onClear={() => {
        setSearchInput('')
        setDebouncedKeyword('')
        setSelectedLabel('')
        onChange(undefined, '')
      }}
      onChange={(nextValue, option) => {
        const label = Array.isArray(option)
          ? ''
          : typeof option?.label === 'string'
            ? option.label
            : ''
        setSelectedLabel(label)
        onChange(typeof nextValue === 'number' ? nextValue : undefined, label)
      }}
      notFoundContent={
        usersQuery.isFetching ? t('Loading...') : t('No users found')
      }
      getPopupContainer={() => document.body}
      popupMatchSelectWidth={false}
      listHeight={280}
    />
  )
}
