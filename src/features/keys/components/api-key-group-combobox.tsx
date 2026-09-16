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
import { Select } from 'antd'
import type { ComponentPropsWithoutRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks'
import { cn } from '@/lib/utils'

import {
  AUTO_GROUP_FRAME_CLASS_NAME,
  AutoGroupFlowBorder,
  GroupRatioBadge,
} from './auto-group-visuals'

export type ApiKeyGroupOption = {
  value: string
  label: string
  desc?: string
  ratio?: number | string
}

type ApiKeyGroupComboboxProps = {
  options: ApiKeyGroupOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
} & Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'children'>

export function ApiKeyGroupCombobox({
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
  ...rootProps
}: ApiKeyGroupComboboxProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const selectedOption = options.find((option) => option.value === value)
  const isAutoSelected = selectedOption?.value === 'auto'

  return (
    <div
      {...rootProps}
      data-auto-group-effect={isAutoSelected ? 'trigger' : undefined}
      className={cn(
        'relative w-full overflow-visible rounded-lg',
        isAutoSelected && AUTO_GROUP_FRAME_CLASS_NAME,
        className
      )}
    >
      {isAutoSelected ? (
        <AutoGroupFlowBorder shouldReduceMotion={shouldReduceMotion} />
      ) : null}
      <Select
        showSearch
        className='w-full'
        size='large'
        disabled={disabled}
        value={value || undefined}
        placeholder={placeholder ?? t('Select a group')}
        optionFilterProp='label'
        filterOption={(input, option) => {
          const search = input.trim().toLowerCase()
          if (!search) return true
          const opt = options.find((o) => o.value === option?.value)
          if (!opt) return false
          const ratioText = String(opt.ratio ?? '').toLowerCase()
          return (
            opt.value.toLowerCase().includes(search) ||
            opt.label.toLowerCase().includes(search) ||
            (opt.desc?.toLowerCase().includes(search) ?? false) ||
            ratioText.includes(search)
          )
        }}
        onChange={(next) => {
          if (next) onValueChange(next)
        }}
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
          option,
        }))}
        optionRender={(item) => {
          const option = item.data.option as ApiKeyGroupOption
          const isAutoOption = option.value === 'auto'
          return (
            <div
              data-slot='select-option'
              data-auto-group-effect={isAutoOption ? 'option' : undefined}
              className={cn(
                'relative flex items-center justify-between gap-2 overflow-visible py-0.5',
                isAutoOption && AUTO_GROUP_FRAME_CLASS_NAME
              )}
            >
              {isAutoOption ? (
                <AutoGroupFlowBorder shouldReduceMotion={shouldReduceMotion} />
              ) : null}
              <div className='min-w-0'>
                <div className='truncate font-medium'>{option.label}</div>
                {option.desc ? (
                  <div className='text-muted-foreground truncate text-xs'>
                    {option.desc}
                  </div>
                ) : null}
              </div>
              <GroupRatioBadge
                ratio={option.ratio}
                isAuto={isAutoOption}
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
          )
        }}
        labelRender={() => {
          if (!selectedOption) return placeholder ?? t('Select a group')
          return (
            <div className='flex w-full items-center justify-between gap-2'>
              <div className='min-w-0'>
                <div className='truncate font-medium'>
                  {selectedOption.label}
                </div>
                {selectedOption.desc ? (
                  <div className='text-muted-foreground truncate text-xs'>
                    {selectedOption.desc}
                  </div>
                ) : null}
              </div>
              <GroupRatioBadge
                ratio={selectedOption.ratio}
                isAuto={selectedOption.value === 'auto'}
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
          )
        }}
        listHeight={360}
        popupMatchSelectWidth
      />
    </div>
  )
}
