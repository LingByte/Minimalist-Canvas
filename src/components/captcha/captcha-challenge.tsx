import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { generateCaptcha } from '@/features/auth/api'

import { ClickCaptcha } from './click-captcha'
import { ImageCaptcha } from './image-captcha'
import { SliderCaptcha } from './slider-captcha'
import {
  captchaTypeLabel,
  type CaptchaGenerateResult,
  type CaptchaProof,
} from './types'

type Props = {
  active: boolean
  onChange: (proof: CaptchaProof | null) => void
}

export function CaptchaChallenge({ active, onChange }: Props) {
  const { t } = useTranslation()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [session, setSession] = useState<CaptchaGenerateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setSession(null)
    onChangeRef.current(null)
    try {
      const res = await generateCaptcha()
      if (!res.success || !res.data?.id) {
        setLoadError(res.message || t('Failed to load captcha'))
        return
      }
      setSession(res.data)
    } catch {
      setLoadError(t('Failed to load captcha'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  if (loading && !session) {
    return (
      <div className='flex h-32 items-center justify-center gap-2 text-sm text-neutral-500'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t('Loading')}
      </div>
    )
  }

  if (loadError && !session) {
    return (
      <div className='space-y-3 rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900 dark:bg-red-950/40'>
        <p className='text-sm text-red-600 dark:text-red-400'>{loadError}</p>
        <button
          type='button'
          className='inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white'
          onClick={() => void load()}
        >
          <RefreshCw className='h-3.5 w-3.5' />
          {t('Refresh captcha')}
        </button>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-2'>
        <span className='inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'>
          {captchaTypeLabel(session.type, t)}
        </span>
        <button
          type='button'
          className='inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          onClick={() => void load()}
        >
          <RefreshCw className='h-3.5 w-3.5' />
          {t('Refresh captcha')}
        </button>
      </div>

      {session.type === 'slider' && (
        <SliderCaptcha session={session} onChange={onChange} onReload={load} />
      )}
      {session.type === 'click' && (
        <ClickCaptcha session={session} onChange={onChange} />
      )}
      {session.type === 'image' && (
        <ImageCaptcha session={session} onChange={onChange} />
      )}
    </div>
  )
}
