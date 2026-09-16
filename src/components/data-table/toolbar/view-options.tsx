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
import { Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { type Table } from '@tanstack/react-table'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const { t } = useTranslation()

  const hideableColumns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          (column) =>
            typeof column.accessorFn !== 'undefined' && column.getCanHide()
        ),
    [table]
  )

  const items: MenuProps['items'] = [
    {
      key: 'label',
      type: 'group',
      label: t('Toggle columns'),
      children: hideableColumns.map((column) => ({
        key: column.id,
        label: (
          <label className='flex cursor-pointer items-center gap-2 capitalize'>
            <input
              type='checkbox'
              className='accent-primary'
              checked={column.getIsVisible()}
              onChange={(event) =>
                column.toggleVisibility(event.target.checked)
              }
              onClick={(event) => event.stopPropagation()}
            />
            {typeof column.columnDef.header === 'string'
              ? column.columnDef.header
              : (column.columnDef.meta?.label ?? column.id)}
          </label>
        ),
      })),
    },
  ]

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement='bottomRight'>
      <Button aria-label={t('View')}>{t('View')}</Button>
    </Dropdown>
  )
}
