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
import type { PasswordProps } from 'antd/es/input'
import type { InputRef } from 'antd'
import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

type PasswordInputProps = Omit<PasswordProps, 'type'> & {
  className?: string
}

export const PasswordInput = forwardRef<InputRef, PasswordInputProps>(
  function PasswordInput({ className, disabled, ...props }, ref) {
    return (
      <Input.Password
        ref={ref}
        disabled={disabled}
        className={cn('w-full', className)}
        visibilityToggle
        {...props}
      />
    )
  }
)
