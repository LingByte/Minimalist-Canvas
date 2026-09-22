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
import { Button, Modal, Typography } from 'antd'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

interface PromptDialogProps {
  prompt: string
  promptEn?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PromptDialog({
  prompt,
  promptEn,
  open,
  onOpenChange,
}: PromptDialogProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      title={t('Prompt Details')}
      footer={null}
      width={512}
      destroyOnHidden
    >
      <p className='text-muted-foreground mb-4 text-sm'>
        {t('View the complete prompt and its English translation')}
      </p>
      <div className='max-h-[500px] space-y-4 overflow-y-auto pr-1'>
        <div className='space-y-2'>
          <Typography.Text strong className='text-sm'>
            {t('Prompt')}
          </Typography.Text>
          <div className='bg-muted/50 relative rounded-md border p-3'>
            <Button
              type='text'
              size='small'
              className='absolute top-2 right-2'
              onClick={() => copyToClipboard(prompt)}
              title={t('Copy to clipboard')}
              icon={
                copiedText === prompt ? (
                  <Check className='size-4 text-green-600' />
                ) : (
                  <Copy className='size-4' />
                )
              }
            />
            <p className='pr-10 text-sm leading-relaxed break-words whitespace-pre-wrap'>
              {prompt || '-'}
            </p>
          </div>
        </div>

        {promptEn && (
          <div className='space-y-2'>
            <Typography.Text strong className='text-sm'>
              {t('Prompt (EN)')}
            </Typography.Text>
            <div className='bg-muted/50 relative rounded-md border p-3'>
              <Button
                type='text'
                size='small'
                className='absolute top-2 right-2'
                onClick={() => copyToClipboard(promptEn)}
                title={t('Copy to clipboard')}
                icon={
                  copiedText === promptEn ? (
                    <Check className='size-4 text-green-600' />
                  ) : (
                    <Copy className='size-4' />
                  )
                }
              />
              <p className='pr-10 text-sm leading-relaxed break-words whitespace-pre-wrap'>
                {promptEn}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
