import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

import { parseChangelog } from './src/features/infinite-canvas/lib/release'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const canvasVersion = readFileSync(
  path.resolve(__dirname, './src/features/infinite-canvas/VERSION'),
  'utf8'
).trim()
const canvasChangelog = readFileSync(
  path.resolve(__dirname, './src/features/infinite-canvas/CHANGELOG.md'),
  'utf8'
)

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
  source: {
    entry: {
      index: './src/main.tsx',
    },
    define: {
      __APP_VERSION__: JSON.stringify(canvasVersion || 'dev'),
      __APP_RELEASES__: JSON.stringify(parseChangelog(canvasChangelog)),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@canvas': path.resolve(__dirname, './src/features/infinite-canvas'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js'),
    },
  },
  tools: {
    rspack: {
      optimization: {
        splitChunks: {
          cacheGroups: {
            tauri: {
              name: 'tauri',
              test: /[\\/]node_modules[\\/]@tauri-apps[\\/]/,
              chunks: 'all',
              priority: 20,
            },
          },
        },
      },
    },
  },
  html: {
    template: './index.html',
  },
  server: {
    port: 1420,
    strictPort: true,
  },
})
