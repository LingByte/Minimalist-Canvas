import { useEffect, useState } from 'react'
import { Button, Modal } from 'antd'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CaptchaChallenge } from './captcha-challenge'
import type { CaptchaProof } from './types'

type Props = {
  open: boolean
  onClose: () => void
  onVerified: (proof: CaptchaProof) => void
}

export function CaptchaVerifyModal({ open, onClose, onVerified }: Props) {
  const { t } = useTranslation()
  const [proof, setProof] = useState<CaptchaProof | null>(null)

  useEffect(() => {
    if (!open) {
      setProof(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !proof?.captchaId) return
    if (proof.captchaType === 'image') return
    const timer = window.setTimeout(() => onVerified(proof), 380)
    return () => window.clearTimeout(timer)
  }, [open, proof, onVerified])

  const isImage = proof?.captchaType === 'image'

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      closable
      maskClosable={false}
      destroyOnHidden
      onCancel={onClose}
      className='captcha-verify-modal'
      width={420}
      styles={{ body: { paddingTop: 8 } }}
    >
      <div className='px-1 pb-1 pt-2'>
        <div className='mb-5 flex items-start gap-3'>
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'>
            <ShieldCheck className='h-5 w-5' strokeWidth={2} />
          </div>
          <div>
            <h3 className='text-base font-semibold tracking-tight text-foreground'>
              {t('Security verification')}
            </h3>
            <p className='mt-1 text-sm leading-relaxed text-muted-foreground'>
              {t(
                'Complete the verification below to continue (slider, click, or image captcha may appear).'
              )}
            </p>
          </div>
        </div>

        <CaptchaChallenge active={open} onChange={setProof} />

        {isImage ? (
          <div className='mt-5 flex justify-end gap-2'>
            <Button onClick={onClose}>{t('Cancel')}</Button>
            <Button
              type='primary'
              disabled={!proof?.captchaId}
              onClick={() => proof && onVerified(proof)}
            >
              {t('Confirm and continue')}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
