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
import { Modal, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type TelegramLoginDialogProps = {
  open: boolean
  botName: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onAuthorization: (authorization: unknown) => void
}

let telegramCallbackSequence = 0

export function TelegramLoginDialog(props: TelegramLoginDialogProps) {
  const { t } = useTranslation()
  const widgetContainer = useRef<HTMLDivElement | null>(null)
  const authorizationHandler = useRef(props.onAuthorization)
  const [callbackName] = useState(
    () => `newApiTelegramLogin${++telegramCallbackSequence}`
  )
  const [widgetState, setWidgetState] = useState<
    'idle' | 'loading' | 'ready' | 'failed'
  >('idle')

  useEffect(() => {
    authorizationHandler.current = props.onAuthorization
  }, [props.onAuthorization])

  useEffect(() => {
    const container = widgetContainer.current
    const botName = props.botName.trim()
    if (!props.open || !container || !botName) return

    setWidgetState('loading')
    const callback = (authorization: unknown) => {
      authorizationHandler.current(authorization)
    }
    const browserWindow = window as unknown as Record<string, unknown>
    browserWindow[callbackName] = callback

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.dataset.telegramLogin = botName
    script.dataset.size = 'large'
    script.dataset.radius = '8'
    script.dataset.onauth = `${callbackName}(user)`
    const handleLoad = () => setWidgetState('ready')
    const handleError = () => setWidgetState('failed')
    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)
    container.replaceChildren(script)

    return () => {
      script.removeEventListener('load', handleLoad)
      script.removeEventListener('error', handleError)
      container.replaceChildren()
      delete browserWindow[callbackName]
    }
  }, [callbackName, props.botName, props.open])

  return (
    <Modal
      open={props.open}
      onCancel={() => props.onOpenChange(false)}
      title={t('Telegram Login Widget')}
      footer={null}
      destroyOnHidden
      width={384}
    >
      <p className='text-muted-foreground mb-4 text-sm'>
        {t('Continue with Telegram')}
      </p>
      <div
        className='flex min-h-12 items-center justify-center'
        aria-busy={widgetState === 'loading' || props.pending}
      >
        {(widgetState === 'loading' || props.pending) && <Spin />}
        {widgetState === 'failed' && (
          <p className='text-destructive text-sm'>{t('Login failed')}</p>
        )}
        <div
          ref={widgetContainer}
          className={
            widgetState === 'ready' && !props.pending ? 'block' : 'hidden'
          }
        />
      </div>
    </Modal>
  )
}
