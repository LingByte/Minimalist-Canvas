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
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO } from '@/lib/constants'
import { SmartImage } from '@/components/smart-image'

const ICONS = [
  '/icons/icons/openai_icon_svg.svg',
  '/icons/icons/aws_bedrock_icon_svg.svg',
  '/icons/icons/azure_icon_svg.svg',
  '/icons/icons/gemini_icon_svg.svg',
  '/icons/icons/tencent_cloud_icon_svg.svg',
  '/icons/icons/deepseek_icon_svg.svg',
  '/icons/icons/zhipu_icon_svg.svg',
  '/icons/icons/kimi_icon_svg.svg',
  '/icons/icons/volcanic_engine_icon_svg.svg',
  '/icons/icons/ollama_icon_svg.svg',
  '/icons/icons/local_icon_svg.svg',
  '/icons/icons/tencent_icon_svg.svg',
  '/icons/icons/minimax_icon_svg.svg',
  '/icons/icons/docker_ai_icon_svg.svg',
  '/icons/icons/wenxin_icon_svg.svg',
  '/icons/icons/vllm_icon_svg.svg',
  '/icons/icons/xinference_icon_svg.svg',
  '/icons/icons/anthropic_icon_svg.svg',
] as const

const ORBITS = [
  { size: 300, speed: 0.0012, iconCount: 4 },
  { size: 520, speed: -0.0026, iconCount: 6 },
  { size: 740, speed: 0.0036, iconCount: 8 },
] as const

const PARTICLE_TOTAL = 140
const PARTICLE_SPEED_RANGE = 0.018
const PARTICLE_RADIUS_RANGE: [number, number] = [60, 500]

type OrbitIconSlot = {
  el: HTMLDivElement
  baseAngle: number
  radius: number
  orbitIndex: number
}

/** Polar offset matching rotate(angle) + translateY(-radius) in the reference layout. */
function orbitIconTransform(angle: number, radius: number) {
  const x = Math.sin(angle) * radius
  const y = -Math.cos(angle) * radius
  return `translate(-50%, -50%) translate(${x}px, ${y}px)`
}

export function AuthCarousel() {
  const { t } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const logoUrl = logo || DEFAULT_LOGO
  const iconSlotsRef = useRef<OrbitIconSlot[]>([])
  const particleRefs = useRef<(HTMLSpanElement | null)[]>([])
  const frameRef = useRef<number | null>(null)
  const stateRef = useRef({
    orbitRotate: [0, 0, 0],
    particles: [] as Array<{ angle: number; radius: number; speed: number }>,
  })

  const totalIcons = useMemo(
    () => ORBITS.reduce((sum, orbit) => sum + orbit.iconCount, 0),
    []
  )

  useEffect(() => {
    stateRef.current.particles = Array.from({ length: PARTICLE_TOTAL }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius:
        PARTICLE_RADIUS_RANGE[0] +
        Math.random() *
          (PARTICLE_RADIUS_RANGE[1] - PARTICLE_RADIUS_RANGE[0]),
      speed: (Math.random() - 0.5) * PARTICLE_SPEED_RANGE,
    }))

    const animate = () => {
      const state = stateRef.current

      ORBITS.forEach((orbit, orbitIndex) => {
        state.orbitRotate[orbitIndex] += orbit.speed
      })

      iconSlotsRef.current.forEach((slot) => {
        const angle =
          slot.baseAngle + state.orbitRotate[slot.orbitIndex]
        slot.el.style.transform = orbitIconTransform(angle, slot.radius)
      })

      particleRefs.current.forEach((el, index) => {
        if (!el) return
        const particle = state.particles[index]
        particle.angle += particle.speed
        const x = Math.cos(particle.angle) * particle.radius
        const y = Math.sin(particle.angle) * particle.radius
        el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`
      })

      frameRef.current = window.requestAnimationFrame(animate)
    }

    frameRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [totalIcons])

  return (
    <div className='relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#e8f1fc_0%,#f4f8fd_48%,#ffffff_100%)]'>
      <div className='absolute right-0 bottom-0 left-0 z-[15] h-[min(72vh,720px)] bg-[linear-gradient(0deg,rgba(255,255,255,1)_0%,rgba(255,255,255,0.99)_5%,rgba(255,255,255,0.98)_12%,rgba(255,255,255,0.94)_20%,rgba(255,255,255,0.88)_30%,rgba(255,255,255,0.76)_42%,rgba(255,255,255,0.56)_58%,rgba(255,255,255,0.28)_78%,rgba(255,255,255,0.06)_92%,rgba(255,255,255,0)_100%)]' />

      <div className='pointer-events-none absolute bottom-[clamp(28px,4vh,44px)] left-1/2 z-20 w-[min(86%,580px)] -translate-x-1/2 text-center'>
        <div className='text-[clamp(20px,1.6vw,28px)] font-semibold tracking-tight text-neutral-900'>
          {t('auth.carouselTitle', { name: systemName })}
        </div>
        <div className='mt-3 text-[clamp(14px,1.05vw,17px)] leading-[1.6] text-neutral-500'>
          {t('auth.carouselSubtitle')}
        </div>
      </div>

      <div
        className='absolute top-[46%] left-1/2 z-10 box-content h-[900px] w-[900px] overflow-visible'
        style={{ transform: 'translate(-50%, -50%) scale(1.20)' }}
      >
        {ORBITS.map((orbit, ringIndex) => (
          <div
            key={orbit.size}
            className='absolute top-1/2 left-1/2 box-content rounded-full border'
            style={{
              width: orbit.size,
              height: orbit.size,
              transform: 'translate(-50%, -50%)',
              borderColor: `hsla(215, 87%, 51%, ${0.16 + ringIndex * 0.05})`,
              boxShadow: `0 0 24px hsla(215, 87%, 51%, ${0.04 + ringIndex * 0.02}) inset`,
            }}
          />
        ))}

        <div
          className='absolute top-1/2 left-1/2 z-20 flex h-[118px] w-[118px] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_0_0_12px_rgba(255,255,255,0.9),0_12px_40px_rgba(15,23,42,0.12)]'
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <SmartImage
            src={logoUrl}
            alt=''
            draggable={false}
            loading="eager"
            className='h-full w-full object-contain p-4'
            fallbackClassName='h-full w-full'
          />
        </div>

        {ORBITS.map((orbit, orbitIndex) => {
          const startIndex = ORBITS.slice(0, orbitIndex).reduce(
            (sum, item) => sum + item.iconCount,
            0
          )
          const icons = ICONS.slice(startIndex, startIndex + orbit.iconCount)
          const radius = orbit.size / 2

          return icons.map((icon, iconIndex) => {
            const baseAngle = (Math.PI * 2 * iconIndex) / orbit.iconCount

            return (
              <div
                key={icon}
                ref={(el) => {
                  const slotKey = `${orbitIndex}-${icon}`
                  if (!el) {
                    iconSlotsRef.current = iconSlotsRef.current.filter(
                      (s) => s.el.dataset.orbitIcon !== slotKey
                    )
                    return
                  }
                  el.dataset.orbitIcon = slotKey
                  const slot: OrbitIconSlot = {
                    el,
                    baseAngle,
                    radius,
                    orbitIndex,
                  }
                  const existing = iconSlotsRef.current.findIndex(
                    (s) => s.el.dataset.orbitIcon === slotKey
                  )
                  if (existing >= 0) {
                    iconSlotsRef.current[existing] = slot
                  } else {
                    iconSlotsRef.current.push(slot)
                  }
                  el.style.transform = orbitIconTransform(baseAngle, radius)
                }}
                className='absolute top-1/2 left-1/2 grid h-[44px] w-[44px] place-items-center rounded-full bg-white/88 shadow-[0_10px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-[box-shadow,background-color] duration-300 hover:bg-white hover:shadow-[0_14px_28px_rgba(22,113,239,0.22)]'
              >
                <SmartImage
                  src={icon}
                  alt=''
                  draggable={false}
                  loading="eager"
                  className='relative z-10 h-[70%] w-[70%] object-contain opacity-95 mix-blend-multiply'
                  fallbackIconClassName='size-4'
                />
              </div>
            )
          })
        })}

        <div
          className='pointer-events-none absolute top-1/2 left-1/2 h-[900px] w-[900px] overflow-visible'
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          {Array.from({ length: PARTICLE_TOTAL }).map((_, index) => (
            <span
              key={`particle-${index}`}
              ref={(el) => {
                particleRefs.current[index] = el
              }}
              className='absolute top-1/2 left-1/2 h-[4px] w-[4px] rounded-full bg-[rgba(126,194,255,0.58)] shadow-[0_0_12px_rgba(126,194,255,0.34)]'
              style={{ transform: 'translate(-50%, -50%)' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
