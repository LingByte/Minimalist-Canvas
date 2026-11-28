import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

import { parseChangelog } from './src/features/infinite-canvas/lib/release'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const versionPath = path.resolve(__dirname, './src/features/infinite-canvas/VERSION')
const changelogPath = path.resolve(
  __dirname,
  './src/features/infinite-canvas/CHANGELOG.md'
)

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const canvasVersion = readFileSync(versionPath, 'utf8').trim()
  const canvasChangelog = readFileSync(changelogPath, 'utf8')

  return {
    plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
    source: {
      entry: {
        index: './src/main.tsx',
      },
      define: {
        ...env.publicVars,
        __APP_VERSION__: JSON.stringify(canvasVersion || 'dev'),
        __APP_RELEASES__: JSON.stringify(parseChangelog(canvasChangelog)),
      },
    },
    server: {
      // Re-evaluate define when changelog/version notes change in dev.
      watchFiles: [{ paths: [changelogPath, versionPath], type: 'reload' }],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@canvas': path.resolve(__dirname, './src/features/infinite-canvas'),
        '@tauri-apps/plugin-clipboard-manager': path.resolve(
          __dirname,
          './node_modules/@tauri-apps/plugin-clipboard-manager/dist-js/index.js'
        ),
        react: path.resolve(__dirname, './node_modules/react'),
        'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
        'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
        'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js'),
      },
    },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              resourceQuery: /raw/,
              type: 'asset/source',
            },
          ],
        },
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
  }
})
