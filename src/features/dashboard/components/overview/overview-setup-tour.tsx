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
import { Button } from 'antd'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export const OVERVIEW_TOUR_STORAGE_KEY = 'dashboard_overview_setup_tour_seen'

type TourStepId =
  | 'welcome'
  | 'actions'
  | 'panels'
  | 'done'

type TourStep = {
  id: TourStepId
  target?: string
  titleKey: string
  bodyKey: string
}

const BASE_STEPS: TourStep[] = [
  {
    id: 'welcome',
    titleKey: 'Overview tour: Welcome',
    bodyKey:
      'A short walkthrough of quick actions and service health on this page.',
  },
  {
    id: 'actions',
    target: '[data-overview-tour="actions"]',
    titleKey: 'Overview tour: Actions',
    bodyKey:
      'Jump to keys, channels, logs, or pricing when you need to configure the platform.',
  },
  {
    id: 'panels',
    target: '[data-overview-tour="panels"]',
    titleKey: 'Overview tour: Panels',
    bodyKey: 'Announcements and FAQ live here when enabled.',
  },
  {
    id: 'done',
    titleKey: 'Overview tour: Done',
    bodyKey: 'Replay this tour anytime with the guide button on this page.',
  },
]

type SpotlightRect = {
  top: number
  left: number
  width: number
  height: number
}

function readTargetRect(selector: string | undefined): SpotlightRect | null {
  if (!selector || typeof document === 'undefined') return null
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return null
  const pad = 10
  return {
    top: Math.max(8, rect.top - pad),
    left: Math.max(8, rect.left - pad),
    width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
    height: Math.min(window.innerHeight - 16, rect.height + pad * 2),
  }
}

export function markOverviewTourSeen() {
  try {
    localStorage.setItem(OVERVIEW_TOUR_STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

export function hasSeenOverviewTour(): boolean {
  try {
    return localStorage.getItem(OVERVIEW_TOUR_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

type OverviewSetupTourProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  showPanelsStep: boolean
}

export function OverviewSetupTour({
  open,
  onOpenChange,
  showPanelsStep,
}: OverviewSetupTourProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const maskId = useId()
  const steps = useMemo(
    () =>
      BASE_STEPS.filter(
        (step) => showPanelsStep || step.id !== 'panels'
      ),
    [showPanelsStep]
  )
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)
  const [ready, setReady] = useState(false)

  const step = steps[stepIndex] ?? steps[0]
  const total = steps.length

  const refreshRect = useCallback(() => {
    if (!open || !step) {
      setRect(null)
      return
    }
    const next = readTargetRect(step.target)
    setRect(next)
    if (next && step.target) {
      const el = document.querySelector(step.target)
      if (el instanceof HTMLElement) {
        el.scrollIntoView({
          block: 'center',
          behavior: reduceMotion ? 'auto' : 'smooth',
        })
      }
    }
  }, [open, reduceMotion, step])

  useEffect(() => {
    if (!open) {
      setStepIndex(0)
      setReady(false)
      setRect(null)
      return
    }
    setStepIndex(0)
    setReady(false)
    const timer = window.setTimeout(() => setReady(true), reduceMotion ? 0 : 80)
    return () => window.clearTimeout(timer)
  }, [open, reduceMotion])

  useLayoutEffect(() => {
    if (!open || !ready) return
    refreshRect()
  }, [open, ready, refreshRect, stepIndex])

  useEffect(() => {
    if (!open) return
    const onResize = () => refreshRect()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, refreshRect])

  const close = useCallback(() => {
    markOverviewTourSeen()
    onOpenChange(false)
  }, [onOpenChange])

  const next = () => {
    if (stepIndex >= total - 1) {
      close()
      return
    }
    setStepIndex((i) => i + 1)
  }

  const prev = () => {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  if (!open || typeof document === 'undefined' || !step) return null

  const isLast = stepIndex === total - 1
  const cardStyle = (() => {
    const cardWidth = Math.min(360, window.innerWidth - 32)
    if (!rect) {
      return {
        top: Math.max(24, window.innerHeight * 0.28),
        left: Math.max(16, (window.innerWidth - cardWidth) / 2),
        width: cardWidth,
      }
    }
    const below = rect.top + rect.height + 16
    const fitsBelow = below + 220 < window.innerHeight
    const top = fitsBelow
      ? below
      : Math.max(16, rect.top - 220)
    let left = rect.left
    if (left + cardWidth > window.innerWidth - 16) {
      left = window.innerWidth - cardWidth - 16
    }
    left = Math.max(16, left)
    return { top, left, width: cardWidth }
  })()

  return createPortal(
    <div
      className='pointer-events-none fixed inset-0 z-[11000]'
      role='dialog'
      aria-modal='true'
      aria-label={t('Overview setup tour')}
    >
      <div
        className='pointer-events-auto absolute inset-0'
        onClick={(event) => event.stopPropagation()}
      >
        <svg
          className='absolute inset-0 h-full w-full'
          width='100%'
          height='100%'
          aria-hidden
        >
          <defs>
            <mask id={maskId}>
              <rect width='100%' height='100%' fill='white' />
              {rect ? (
                <rect
                  x={rect.left}
                  y={rect.top}
                  width={rect.width}
                  height={rect.height}
                  rx='16'
                  ry='16'
                  fill='black'
                />
              ) : null}
            </mask>
          </defs>
          <rect
            width='100%'
            height='100%'
            fill='rgba(15, 23, 42, 0.58)'
            mask={`url(#${maskId})`}
          />
        </svg>
        {rect ? (
          <motion.div
            className='border-primary/80 pointer-events-none absolute rounded-2xl border-2'
            initial={false}
            animate={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              boxShadow:
                '0 0 0 1px color-mix(in oklch, var(--primary) 35%, transparent), 0 16px 48px rgba(0,0,0,0.28)',
            }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 320, damping: 28 }
            }
          />
        ) : null}
      </div>

      <AnimatePresence mode='wait'>
        {ready ? (
          <motion.div
            key={step.id}
            className='pointer-events-auto absolute z-[11001]'
            style={cardStyle}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className='bg-card overflow-hidden rounded-2xl border shadow-xl'>
              <div className='from-primary via-chart-2 to-chart-4 h-1 w-full bg-gradient-to-r' />
              <div className='space-y-3 p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <div className='text-muted-foreground text-[11px] font-medium tracking-[0.14em] uppercase'>
                      {t('Step {{current}} of {{total}}', {
                        current: stepIndex + 1,
                        total,
                      })}
                    </div>
                    <h2 className='mt-1 text-base font-semibold'>
                      {t(step.titleKey)}
                    </h2>
                  </div>
                  <button
                    type='button'
                    className='text-muted-foreground hover:text-foreground text-xs transition'
                    onClick={close}
                  >
                    {t('Skip')}
                  </button>
                </div>
                <p className='text-muted-foreground text-sm leading-6'>
                  {t(step.bodyKey)}
                </p>
                <div className='flex items-center justify-between gap-2 pt-1'>
                  <Button size='small' disabled={stepIndex === 0} onClick={prev}>
                    {t('Back')}
                  </Button>
                  <Button type='primary' size='small' onClick={next}>
                    {isLast ? t('Finish') : t('Next')}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body
  )
}
