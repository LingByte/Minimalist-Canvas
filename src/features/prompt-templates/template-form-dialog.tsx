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
import { Button, Drawer, Form, Input, Space, Upload } from 'antd'
import { Sparkles, Upload as UploadIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { TagInput } from '@/components/tag-input'
import { SmartImage } from '@/components/smart-image'
import { uploadToObjectStorage } from '@/features/infinite-canvas/services/object-storage'

import { CoverGenerateDialog } from './cover-generate-dialog'
import type { PromptTemplateInput, PromptTemplateItem } from './types'

type Props = {
  open: boolean
  initial?: PromptTemplateItem | null
  confirming?: boolean
  onCancel: () => void
  onSubmit: (values: PromptTemplateInput) => void
}

export function TemplateFormDialog({
  open,
  initial,
  confirming,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<PromptTemplateInput>()
  const [coverUrl, setCoverUrl] = useState('')
  const [refs, setRefs] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [coverGenOpen, setCoverGenOpen] = useState(false)
  const [coverGenPrompt, setCoverGenPrompt] = useState('')

  useEffect(() => {
    if (!open) return
    setCoverUrl(initial?.coverUrl || '')
    setRefs(initial?.referenceImageUrls || [])
    form.setFieldsValue({
      title: initial?.title || '',
      prompt: initial?.prompt || '',
      description: initial?.description || '',
      author: initial?.author || '',
      githubUrl: initial?.githubUrl || '',
      preview: initial?.preview || '',
      tags: initial?.tags || [],
    })
  }, [open, initial, form])

  const uploadImage = async (file: File) => {
    setUploading(true)
    try {
      const uploaded = await uploadToObjectStorage(file, {
        filename: file.name,
        contentType: file.type || 'image/png',
        purpose: 'ailingecho',
      })
      if (!uploaded?.accessUrl) {
        toast.error(t('Object storage is disabled or upload failed'))
        return null
      }
      return uploaded.accessUrl
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to upload image')
      )
      return null
    } finally {
      setUploading(false)
    }
  }

  const submit = () => {
    void form.validateFields().then((values) => {
      onSubmit({
        title: values.title,
        prompt: values.prompt,
        description: values.description || '',
        author: values.author || '',
        githubUrl: values.githubUrl || '',
        preview: values.preview || '',
        coverUrl,
        referenceImageUrls: refs,
        tags: values.tags || [],
      })
    })
  }

  return (
    <Drawer
      open={open}
      title={initial ? t('Edit template') : t('Add template')}
      onClose={onCancel}
      placement='right'
      width={560}
      destroyOnClose
      footer={
        <div className='flex justify-end gap-2'>
          <Button onClick={onCancel}>{t('Cancel')}</Button>
          <Button
            type='primary'
            loading={confirming || uploading}
            onClick={submit}
          >
            {initial ? t('Save') : t('Create')}
          </Button>
        </div>
      }
    >
      <Form form={form} layout='vertical' className='pt-1'>
        <Form.Item
          name='title'
          label={t('Title')}
          rules={[{ required: true, message: t('Title is required') }]}
        >
          <Input maxLength={512} />
        </Form.Item>
        <Form.Item
          name='prompt'
          label={t('Prompt')}
          rules={[{ required: true, message: t('Prompt is required') }]}
        >
          <Input.TextArea rows={6} />
        </Form.Item>
        <Form.Item name='description' label={t('Description')}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name='tags' label={t('Tags')}>
          <TagInput placeholder={t('Type a tag and press Enter')} />
        </Form.Item>
        <Form.Item label={t('Cover')}>
          <Space wrap align='start'>
            {coverUrl ? (
              <div className='relative'>
                <SmartImage
                  src={coverUrl}
                  alt=''
                  className='h-24 w-24 rounded object-cover' />
                <Button
                  type='text'
                  size='small'
                  className='absolute top-0 right-0'
                  icon={<X className='size-3.5' />}
                  onClick={() => setCoverUrl('')}
                />
              </div>
            ) : null}
            <Upload
              accept='image/*'
              showUploadList={false}
              beforeUpload={(file) => {
                void uploadImage(file).then((url) => {
                  if (url) setCoverUrl(url)
                })
                return false
              }}
            >
              <Button
                icon={<UploadIcon className='size-3.5' />}
                loading={uploading}
              >
                {t('Upload cover')}
              </Button>
            </Upload>
            <Button
              icon={<Sparkles className='size-3.5' />}
              onClick={() => {
                setCoverGenPrompt(form.getFieldValue('prompt') || '')
                setCoverGenOpen(true)
              }}
            >
              {t('Generate cover')}
            </Button>
            <Input
              className='min-w-[240px]'
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder={t('Or paste image URL')}
            />
          </Space>
        </Form.Item>
        <Form.Item label={t('Reference images')}>
          <div className='space-y-2'>
            <div className='flex flex-wrap gap-2'>
              {refs.map((url) => (
                <div key={url} className='relative'>
                  <SmartImage
                    src={url}
                    alt=''
                    className='h-16 w-16 rounded object-cover' />
                  <Button
                    type='text'
                    size='small'
                    className='absolute top-0 right-0'
                    icon={<X className='size-3.5' />}
                    onClick={() =>
                      setRefs((prev) => prev.filter((item) => item !== url))
                    }
                  />
                </div>
              ))}
            </div>
            <Upload
              accept='image/*'
              showUploadList={false}
              beforeUpload={(file) => {
                void uploadImage(file).then((url) => {
                  if (url) setRefs((prev) => [...prev, url])
                })
                return false
              }}
            >
              <Button
                icon={<UploadIcon className='size-3.5' />}
                loading={uploading}
              >
                {t('Add reference image')}
              </Button>
            </Upload>
          </div>
        </Form.Item>
        <Form.Item name='author' label={t('Author')}>
          <Input />
        </Form.Item>
        <Form.Item name='githubUrl' label={t('Open source')}>
          <Input placeholder='https://…' />
        </Form.Item>
      </Form>
      <CoverGenerateDialog
        open={coverGenOpen}
        defaultPrompt={coverGenPrompt}
        uploadPurpose='ailingecho'
        onCancel={() => setCoverGenOpen(false)}
        onGenerated={(url) => {
          setCoverUrl(url)
          setCoverGenOpen(false)
        }}
      />
    </Drawer>
  )
}
