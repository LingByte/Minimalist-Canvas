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

import { searchApiKeys } from '@/features/keys/api'

type AdminTaskTokenSelectProps = {
  userId?: number
  tokenId?: number
  tokenName?: string
  onChange: (tokenId: number | undefined, tokenName: string) => void
}

export function AdminTaskTokenSelect({
  userId,
  tokenId,
  tokenName,
  onChange,
}: AdminTaskTokenSelectProps) {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setSearchInput('')
    setDebouncedKeyword('')
  }, [userId])

  const tokensQuery = useQuery({
    queryKey: ['admin-task-token-select', userId, debouncedKeyword],
    enabled: userId != null,
    queryFn: async () => {
      const response = await searchApiKeys({
        userId,
        keyword: debouncedKeyword,
        p: 1,
        size: 50,
      })
      if (!response.success) {
        throw new Error(response.message || t('Failed to load API keys'))
      }
      return response.data?.items || []
    },
    staleTime: 30_000,
  })

  const options = useMemo(() => {
    const next = (tokensQuery.data || []).map((token) => ({
      value: token.id,
      label: token.name,
    }))
    if (tokenId && !next.some((item) => item.value === tokenId)) {
      next.unshift({
        value: tokenId,
        label: tokenName || `#${tokenId}`,
      })
    }
    return next
  }, [tokensQuery.data, tokenId, tokenName])

  return (
    <Select
      className='w-full max-w-full'
      size='small'
      showSearch
      allowClear
      disabled={userId == null}
      optionFilterProp='label'
      filterOption={false}
      placeholder={t('Token Name')}
      value={tokenId}
      options={options}
      loading={tokensQuery.isFetching}
      onSearch={setSearchInput}
      onClear={() => {
        setSearchInput('')
        setDebouncedKeyword('')
        onChange(undefined, '')
      }}
      onChange={(nextValue, option) => {
        let label = ''
        if (!Array.isArray(option) && typeof option?.label === 'string') {
          label = option.label
        }
        onChange(nextValue, label)
      }}
    />
  )
}
