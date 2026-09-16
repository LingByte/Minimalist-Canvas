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
import { Button } from 'antd'
import { Pencil, Trash2 } from 'lucide-react'

import { DataTableRowActionMenu } from '../core/row-action-menu'

type StaticRowActionsProps = {
  editLabel: string
  deleteLabel: string
  menuLabel: string
  onEdit: () => void
  onDelete: () => void
  editDisabled?: boolean
  deleteDisabled?: boolean
}

export function StaticRowActions(props: StaticRowActionsProps) {
  return (
    <div className='flex justify-end gap-1'>
      <Button
        type='text'
        size='small'
        onClick={props.onEdit}
        disabled={props.editDisabled}
        aria-label={props.editLabel}
        className='inline-flex h-7 w-7 items-center justify-center p-0'
        icon={<Pencil className='size-4' />}
      />
      <DataTableRowActionMenu ariaLabel={props.menuLabel}>
        <button
          type='button'
          onClick={props.onDelete}
          disabled={props.deleteDisabled}
          className='text-destructive hover:bg-muted flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm disabled:opacity-50'
        >
          {props.deleteLabel}
          <Trash2 size={16} />
        </button>
      </DataTableRowActionMenu>
    </div>
  )
}
