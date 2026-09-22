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
import { Modal, Skeleton } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ImageDialogProps {
  imageUrl: string
  taskId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImageDialog({
  imageUrl,
  taskId,
  open,
  onOpenChange,
}: ImageDialogProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setIsLoading(true)
      setHasError(false)
    }
    onOpenChange(newOpen)
  }

  const handleImageLoad = () => {
    setIsLoading(false)
    setHasError(false)
  }

  const handleImageError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  return (
    <Modal
      open={open}
      onCancel={() => handleOpenChange(false)}
      title={t('Image Preview')}
      footer={null}
      width={768}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (visible) {
          setIsLoading(true)
          setHasError(false)
        }
      }}
    >
      <p className='text-muted-foreground mb-4 text-sm'>
        {taskId ? `${t('Task ID:')} ${taskId}` : t('View the generated image')}
      </p>
      <div className='max-h-[600px] overflow-y-auto'>
        <div className='bg-muted/50 relative flex min-h-[300px] items-center justify-center rounded-lg border'>
          {(isLoading || hasError) && (
            <Skeleton.Node
              active
              className='absolute inset-0 h-full w-full rounded-lg'
              style={{ width: '100%', height: '100%' }}
            />
          )}

          <img
            src={imageUrl}
            alt={t('Generated image')}
            className={`max-h-[550px] w-full rounded-lg object-contain ${
              isLoading || hasError ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            loading='lazy'
          />

          {hasError && (
            <div className='absolute inset-0 flex items-center justify-center'>
              <p className='text-muted-foreground text-sm'>
                {t('Failed to load image')}
              </p>
            </div>
          )}
        </div>

        <div className='bg-muted mt-4 rounded-md p-3'>
          <p className='text-muted-foreground font-mono text-xs break-all'>
            {imageUrl}
          </p>
        </div>
      </div>
    </Modal>
  )
}
