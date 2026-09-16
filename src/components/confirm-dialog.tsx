import { Modal } from 'antd'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title?: ReactNode
  children?: ReactNode
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  confirmLoading?: boolean
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Modal
      open={props.open}
      title={props.title}
      okText={props.confirmText}
      cancelText={props.cancelText}
      onOk={props.onConfirm}
      onCancel={props.onCancel}
      confirmLoading={props.confirmLoading}
    >
      {props.children}
    </Modal>
  )
}
