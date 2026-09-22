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

/**
 * Pricing surfaces follow host theme tokens (oklch CSS vars), not a separate
 * warm-paper palette that reads as yellow on screen.
 */
export const pricingSurfaceVars = {
  panel: 'var(--card)',
  panelBorder: 'var(--border)',
  fill: 'var(--muted)',
  muted: 'var(--muted-foreground)',
  faint: 'color-mix(in oklch, var(--muted-foreground) 65%, transparent)',
  active: 'var(--foreground)',
} as const
