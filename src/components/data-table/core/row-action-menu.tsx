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
import { MoreHorizontal } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

type DataTableRowActionMenuProps = {
  children: React.ReactNode
  ariaLabel: string
  contentClassName?: string
  modal?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DataTableRowActionMenu(props: DataTableRowActionMenuProps) {
  return (
    <Dropdown
      trigger={['click']}
      onOpenChange={props.onOpenChange}
      popupRender={() => (
        <div
          className={cn(
            'bg-popover text-popover-foreground min-w-48 rounded-md border p-1 shadow-md',
            props.contentClassName
          )}
        >
          {props.children}
        </div>
      )}
    >
      <Button
        type='text'
        className='inline-flex h-8 w-8 items-center justify-center p-0'
        aria-label={props.ariaLabel}
        icon={<MoreHorizontal aria-hidden='true' className='size-4' />}
      />
    </Dropdown>
  )
}
