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
import { Modal } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  disabled?: boolean
  desc: React.JSX.Element | string
  cancelBtnText?: string
  confirmText?: ReactNode
  destructive?: boolean
  handleConfirm: () => void | Promise<unknown>
  isLoading?: boolean
  className?: string
  children?: ReactNode
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal
      open={props.open}
      onCancel={() => props.onOpenChange(false)}
      title={props.title}
      className={props.className}
      okText={props.confirmText ?? t('Continue')}
      cancelText={props.cancelBtnText ?? t('Cancel')}
      okButtonProps={{
        danger: props.destructive,
        disabled: props.disabled || props.isLoading,
        loading: props.isLoading,
      }}
      cancelButtonProps={{ disabled: props.isLoading }}
      onOk={() => props.handleConfirm()}
      destroyOnHidden
    >
      <div className='text-muted-foreground text-sm'>{props.desc}</div>
      {props.children}
    </Modal>
  )
}
