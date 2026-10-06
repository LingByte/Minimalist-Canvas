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
import { Alert, Input, Modal, Segmented, Select } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchUserApiToken } from '@/features/infinite-canvas/integration/fetch-user-api-token'
import { inferCapabilityFromPricing } from '@/features/infinite-canvas/integration/pricing-model-mapper'
import { uploadToObjectStorage } from '@/features/infinite-canvas/services/object-storage'
import { QUOTA_TYPE_VALUES } from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { formatRequestPrice } from '@/features/pricing/lib/price'

const COVER_RATIOS = ['1:1', '4:3', '3:4', '16:9'] as const
const PREFERRED_COVER_MODEL = 'gpt-image-2'

type Props = {
  open: boolean
  defaultPrompt: string
  /** Object storage purpose used when the model returns inline image data. */
  uploadPurpose: string
  onCancel: () => void
  onGenerated: (coverUrl: string) => void
}

export function CoverGenerateDialog({
  open,
  defaultPrompt,
  uploadPurpose,
  onCancel,
  onGenerated,
}: Props) {
  const { t } = useTranslation()
  const { models, priceRate, usdExchangeRate, isLoading } = usePricingData()
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [ratio, setRatio] = useState<string>('1:1')
  const [generating, setGenerating] = useState(false)

  const imageModels = useMemo(
    () => models.filter((item) => inferCapabilityFromPricing(item) === 'image'),
    [models]
  )

  useEffect(() => {
    if (open) setPrompt(defaultPrompt)
  }, [open, defaultPrompt])

  useEffect(() => {
    if (!open || model || !imageModels.length) return
    const preferred = imageModels.find(
      (item) => item.model_name === PREFERRED_COVER_MODEL
    )
    setModel((preferred ?? imageModels[0]).model_name)
  }, [open, model, imageModels])

  const selectedModel = imageModels.find((item) => item.model_name === model)
  const priceText = !selectedModel
    ? ''
    : selectedModel.quota_type === QUOTA_TYPE_VALUES.REQUEST
      ? `${formatRequestPrice(selectedModel, false, priceRate, usdExchangeRate)} / ${t('per request')}`
      : t('Billed by usage')

  const generate = async () => {
    const text = prompt.trim()
    if (!text || !model) return
    setGenerating(true)
    try {
      const apiKey = await fetchUserApiToken()
      if (!apiKey) {
        toast.error(
          t('No available API key. Please create an enabled API key first.')
        )
        return
      }
      const [{ requestGeneration }, configStore, { gatewayBaseUrl }] =
        await Promise.all([
          import('@/features/infinite-canvas/services/api/image'),
          import('@/features/infinite-canvas/stores/use-config-store'),
          import('@/features/infinite-canvas/integration/gateway-utils'),
        ])
      const baseUrl = gatewayBaseUrl()
      const channel = configStore.createModelChannel({
        id: 'cover',
        baseUrl,
        apiKey,
        apiFormat: 'openai',
        models: [{ name: model, capability: 'image' }],
      })
      const images = await requestGeneration(
        {
          ...configStore.defaultConfig,
          baseUrl,
          apiKey,
          apiFormat: 'openai',
          channels: [channel],
          model,
          imageModel: model,
          size: ratio,
          count: '1',
        },
        text
      )
      const imageUrl = images[0]?.dataUrl
      if (!imageUrl) throw new Error(t('Failed to generate cover'))
      if (!imageUrl.startsWith('data:')) {
        onGenerated(imageUrl)
        return
      }
      const blob = await (await fetch(imageUrl)).blob()
      const contentType = blob.type || 'image/png'
      const uploaded = await uploadToObjectStorage(blob, {
        filename: `cover-${Date.now()}.${contentType.split('/')[1] || 'png'}`,
        contentType,
        purpose: uploadPurpose,
      })
      if (!uploaded?.accessUrl) {
        throw new Error(t('Object storage is disabled or upload failed'))
      }
      onGenerated(uploaded.accessUrl)
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t('Failed to generate cover')
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('Generate cover')}
      onCancel={generating ? undefined : onCancel}
      maskClosable={!generating}
      closable={!generating}
      okText={t('Generate (deducts credits)')}
      okButtonProps={{
        loading: generating,
        disabled: !prompt.trim() || !model,
      }}
      cancelButtonProps={{ disabled: generating }}
      onOk={() => void generate()}
      destroyOnHidden
    >
      <div className='space-y-4 pt-1'>
        <Alert
          type='warning'
          showIcon
          message={t(
            'Generating a cover calls an image model with your API key and deducts credits from your balance. Charges apply to every generation, even if you do not keep the result.'
          )}
        />
        <div className='space-y-1.5'>
          <div className='text-sm font-medium'>{t('Prompt')}</div>
          <Input.TextArea
            rows={5}
            value={prompt}
            maxLength={4000}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('Describe the cover image to generate')}
          />
        </div>
        <div className='space-y-1.5'>
          <div className='text-sm font-medium'>{t('Model')}</div>
          <Select
            className='w-full'
            showSearch
            loading={isLoading}
            value={model || undefined}
            onChange={setModel}
            placeholder={t('Select a model')}
            notFoundContent={t('No image models available')}
            options={imageModels.map((item) => ({
              value: item.model_name,
              label: item.model_name,
            }))}
          />
          {priceText ? (
            <div className='text-muted-foreground text-xs'>
              {t('Price')}: {priceText}
            </div>
          ) : null}
        </div>
        <div className='space-y-1.5'>
          <div className='text-sm font-medium'>{t('Aspect ratio')}</div>
          <Segmented
            value={ratio}
            onChange={(value) => setRatio(String(value))}
            options={COVER_RATIOS.map((value) => ({ value, label: value }))}
          />
        </div>
      </div>
    </Modal>
  )
}
