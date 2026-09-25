import { useEffect, useRef, useState } from 'react'
import { Input } from 'antd'
import { useTranslation } from 'react-i18next'

import type { CaptchaGenerateResult, CaptchaProof } from './types'

type Props = {
  session: CaptchaGenerateResult
  onChange: (proof: CaptchaProof | null) => void
}

export function ImageCaptcha({ session, onChange }: Props) {
  const { t } = useTranslation()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [code, setCode] = useState('')
  const length = session.data.length ?? 4

  useEffect(() => {
    setCode('')
    onChangeRef.current(null)
  }, [session.id])

  const handleChange = (value: string) => {
    const next = value.trim()
    setCode(next)
    if (next.length >= length) {
      onChangeRef.current({
        captchaId: session.id,
        captchaType: 'image',
        captchaValue: next,
      })
      return
    }
    onChangeRef.current(null)
  }

  return (
    <div className='space-y-3'>
      <p className='text-sm text-neutral-600 dark:text-neutral-300'>
        {t('Enter the characters in the image')}
      </p>
      {session.data.image ? (
        <div className='overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900'>
          <img
            src={session.data.image}
            alt={t('Image captcha')}
            className='mx-auto block h-[60px] w-full max-w-[240px] object-contain'
            draggable={false}
          />
        </div>
      ) : null}
      <Input
        size='large'
        value={code}
        maxLength={length + 2}
        placeholder={t('Enter {{length}}-character code', {
          length: String(length),
        })}
        autoComplete='off'
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  )
}
