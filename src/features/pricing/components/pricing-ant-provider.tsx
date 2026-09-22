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
import type { CSSProperties, ReactNode } from 'react'

import { pricingSurfaceVars } from '@/lib/stone-theme'

/** Pricing surface tokens only — Ant ConfigProvider lives at app root. */
export function PricingAntProvider(props: { children: ReactNode }) {
  return (
    <div
      className='pricing-stone-root bg-background text-foreground min-h-[calc(100dvh-3.5rem)]'
      style={
        {
          ['--pricing-panel' as string]: pricingSurfaceVars.panel,
          ['--pricing-border' as string]: pricingSurfaceVars.panelBorder,
          ['--pricing-fill' as string]: pricingSurfaceVars.fill,
          ['--pricing-muted' as string]: pricingSurfaceVars.muted,
          ['--pricing-faint' as string]: pricingSurfaceVars.faint,
          ['--pricing-active' as string]: pricingSurfaceVars.active,
        } as CSSProperties
      }
    >
      {props.children}
    </div>
  )
}
