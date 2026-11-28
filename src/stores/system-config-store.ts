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
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { DEFAULT_SYSTEM_NAME, DEFAULT_LOGO } from '@/lib/constants'
import { localForageStorage } from '@canvas/lib/localforage-storage'

export interface SystemConfig {
  systemName: string
  logo: string
}

interface SystemConfigState {
  config: SystemConfig
  loading: boolean
  loadedLogoUrl: string
  setConfig: (config: Partial<SystemConfig>) => void
  setLoadedLogoUrl: (url: string) => void
  setLoading: (loading: boolean) => void
}

/**
 * Local branding store (system name / logo). No remote admin backend.
 */
export const useSystemConfigStore = create<SystemConfigState>()(
  persist(
    (set) => ({
      config: {
        systemName: DEFAULT_SYSTEM_NAME,
        logo: DEFAULT_LOGO,
      },
      loading: false,
      loadedLogoUrl: DEFAULT_LOGO,
      setConfig: (newConfig) =>
        set((state) => ({
          config: {
            ...state.config,
            ...newConfig,
          },
        })),
      setLoadedLogoUrl: (url) => set({ loadedLogoUrl: url }),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'system-config-storage',
      storage: createJSONStorage(() => localForageStorage),
      partialize: (state) => ({
        config: {
          systemName: state.config.systemName,
          logo: state.config.logo,
        },
        loadedLogoUrl: state.loadedLogoUrl,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<{
          config: Partial<SystemConfig>
          loadedLogoUrl: string
        }>
        const savedConfig = saved.config ?? {}
        return {
          ...current,
          ...saved,
          config: {
            ...current.config,
            systemName: savedConfig.systemName || current.config.systemName,
            logo: savedConfig.logo || current.config.logo,
          },
        }
      },
    }
  )
)

export const getSystemName = () =>
  useSystemConfigStore.getState().config.systemName

export const getLogo = () => useSystemConfigStore.getState().config.logo
