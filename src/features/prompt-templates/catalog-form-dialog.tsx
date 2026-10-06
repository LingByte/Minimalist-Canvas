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
import { Button, Drawer, Form, Input } from 'antd'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { PromptSourceItem } from './types'

type Props = {
  open: boolean
  initial?: PromptSourceItem | null
  confirming?: boolean
  onCancel: () => void
  onSubmit: (values: { name: string; homepage?: string }) => void
}

export function CatalogFormDialog({
  open,
  initial,
  confirming,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<{ name: string; homepage?: string }>()

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: initial?.name || '',
      homepage: initial?.homepage || '',
    })
  }, [open, initial, form])

  const submit = () => {
    void form.validateFields().then((values) => onSubmit(values))
  }

  return (
    <Drawer
      open={open}
      title={initial ? t('Edit catalog') : t('Add catalog')}
      onClose={onCancel}
      placement='right'
      width={420}
      destroyOnClose
      footer={
        <div className='flex justify-end gap-2'>
          <Button onClick={onCancel}>{t('Cancel')}</Button>
          <Button type='primary' loading={confirming} onClick={submit}>
            {initial ? t('Save') : t('Create')}
          </Button>
        </div>
      }
    >
      <Form form={form} layout='vertical' className='pt-1'>
        <Form.Item
          name='name'
          label={t('Name')}
          rules={[{ required: true, message: t('Name is required') }]}
        >
          <Input placeholder={t('Catalog name')} maxLength={128} />
        </Form.Item>
        <Form.Item name='homepage' label={t('Homepage')}>
          <Input placeholder='https://…' />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
