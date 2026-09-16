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
import { DatePicker as AntDatePicker } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'

import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DateTimePicker(props: DateTimePickerProps) {
  const { t } = useTranslation()
  const placeholderText = props.placeholder ?? t('Select date')

  return (
    <AntDatePicker
      showTime={{ format: 'HH:mm' }}
      className={cn('w-full', props.className)}
      value={props.value ? dayjs(props.value) : null}
      onChange={(value: Dayjs | null) => {
        props.onChange?.(value ? value.toDate() : undefined)
      }}
      placeholder={placeholderText}
      format='YYYY-MM-DD HH:mm'
      allowClear
    />
  )
}
