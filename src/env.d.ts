/// <reference types="@rsbuild/core/types" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_GA4_ID?: string
  readonly VITE_ANALYTICS_BAIDU_ID?: string
  readonly VITE_DOC_URL?: string
  /** Optional remote origin for desktop absolute `/api/storage` URLs. */
  readonly VITE_REACT_APP_SERVER_URL?: string
  readonly VITE_REACT_APP_VERSION?: string
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
