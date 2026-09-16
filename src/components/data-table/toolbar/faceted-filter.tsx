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
import { Badge, Button, Divider, Select } from 'antd'
import type { Column } from '@tanstack/react-table'
import { PlusCircle as PlusCircledIcon } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

type DataTableFacetedFilterProps<TData, TValue> = {
  column?: Column<TData, TValue>
  title?: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
    iconNode?: React.ReactNode
    count?: number
  }[]
  /** Enable single select mode (only one option can be selected at a time) */
  singleSelect?: boolean
}

function DataTableFacetedFilterInner<TData, TValue>({
  column,
  title,
  options,
  singleSelect = false,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const { t } = useTranslation()
  const facets = column?.getFacetedUniqueValues()
  const filterValue = column?.getFilterValue() as string[] | undefined
  const selectedValues = filterValue ?? []

  const selectOptions = options.map((option) => {
    let count: number | undefined
    if (typeof option.count === 'number') {
      count = option.count
    } else {
      count = facets?.get(option.value)
    }
    return {
      value: option.value,
      label: (
        <span className='inline-flex min-w-0 items-center gap-2'>
          {option.iconNode ? (
            <span className='text-muted-foreground flex size-4 items-center justify-center'>
              {option.iconNode}
            </span>
          ) : null}
          {!option.iconNode && option.icon ? (
            <option.icon className='text-muted-foreground size-4' />
          ) : null}
          <span className='min-w-0 flex-1 truncate' title={t(option.label)}>
            {t(option.label)}
          </span>
          {count != null ? (
            <span className='text-muted-foreground ms-auto font-mono text-xs'>
              {count}
            </span>
          ) : null}
        </span>
      ),
    }
  })

  return (
    <Select
      mode={singleSelect ? undefined : 'multiple'}
      allowClear
      value={
        singleSelect
          ? (selectedValues[0] ?? undefined)
          : selectedValues
      }
      onChange={(value) => {
        if (singleSelect) {
          const next = value ? [String(value)] : []
          column?.setFilterValue(next.length ? next : undefined)
          return
        }
        const next = (value as string[]) ?? []
        column?.setFilterValue(next.length ? next : undefined)
      }}
      options={selectOptions}
      placeholder={
        <span className='inline-flex items-center gap-1.5'>
          <PlusCircledIcon className='size-4' />
          {title}
        </span>
      }
      className='min-w-[140px]'
      maxTagCount='responsive'
      optionFilterProp='value'
      popupMatchSelectWidth={false}
      tagRender={(tagProps) => {
        const option = options.find((item) => item.value === tagProps.value)
        return (
          <Badge
            className='me-1'
            count={option ? t(option.label) : String(tagProps.value)}
            style={{ backgroundColor: 'var(--color-muted)', color: 'inherit' }}
          />
        )
      }}
      maxTagPlaceholder={(omitted) => (
        <Badge
          count={`${omitted.length} ${t('selected')}`}
          style={{ backgroundColor: 'var(--color-muted)', color: 'inherit' }}
        />
      )}
      dropdownRender={(menu) => (
        <div>
          <div className='border-b px-2 py-1.5 text-xs font-medium'>{title}</div>
          {menu}
          {selectedValues.length > 0 ? (
            <>
              <Divider className='my-1' />
              <div className='p-1'>
                <Button
                  type='text'
                  block
                  size='small'
                  onClick={() => column?.setFilterValue(undefined)}
                >
                  {t('Clear filters')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    />
  )
}

export const DataTableFacetedFilter = React.memo(
  DataTableFacetedFilterInner
) as typeof DataTableFacetedFilterInner
