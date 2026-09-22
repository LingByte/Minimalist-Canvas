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
/// <reference types="@rsbuild/core/types" />

interface ImportMetaEnv {
  /** Comma-separated local dev plugin URLs (canvas plugin watch mode). */
  readonly VITE_DEV_PLUGINS?: string
  readonly VITE_ANALYTICS_GA4_ID?: string
  readonly VITE_ANALYTICS_BAIDU_ID?: string
  readonly VITE_DOC_URL?: string
  readonly VITE_PLUGIN_REGISTRY_URL?: string
  readonly VITE_PLUGIN_REGISTRY_FALLBACK_URL?: string
  readonly VITE_REACT_APP_SERVER_URL?: string
  readonly VITE_REACT_APP_VERSION?: string
  /** When true/1/yes/on, public "Sign in" becomes one-click demo console entry. */
  readonly VITE_DEMO_LOGIN_ENABLED?: string
  /** Demo account username (default: admin). */
  readonly VITE_DEMO_LOGIN_USERNAME?: string
  /** Demo account password (default: admin123). */
  readonly VITE_DEMO_LOGIN_PASSWORD?: string
}

declare const __APP_VERSION__: string
declare const __APP_RELEASES__: import('@canvas/lib/release').ReleaseInfo[]

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.md?raw' {
  const content: string
  export default content
}

declare module '@visactor/react-vchart' {
  export const VChart: React.ComponentType<Record<string, unknown>>
}
