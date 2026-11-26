import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  createPromptSource,
  DEFAULT_PROMPT_SOURCES,
  type PromptSource,
} from "@canvas/services/api/prompt-source-presets";
import { localForageStorage } from "@canvas/lib/localforage-storage";

type PromptSourceStore = {
  sources: PromptSource[];
  loaded: boolean;
  hydrated: boolean;
  loadSources: () => Promise<void>;
  /** Refresh prompt JSON caches for all enabled sources. */
  syncSources: () => Promise<PromptSource[]>;
  addSource: () => PromptSource;
  saveSource: (source: PromptSource) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => Promise<void>;
  setSources: (sources: PromptSource[]) => void;
};

function isSupportedPromptSourceUrl(url: string) {
  const value = url.trim().toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("builtin://");
}

function mergeWithDefaults(saved: PromptSource[]): PromptSource[] {
  const enabledById = new Map(saved.map((source) => [source.id, source.enabled]));
  const builtIn = DEFAULT_PROMPT_SOURCES.map((source) => ({
    ...source,
    enabled: enabledById.get(source.id) ?? source.enabled,
  }));
  // Drop legacy product sources (e.g. local://manual / 至简未来) that cannot be fetched.
  const custom = saved
    .filter(
      (source) =>
        !source.builtIn &&
        !DEFAULT_PROMPT_SOURCES.some((item) => item.id === source.id) &&
        isSupportedPromptSourceUrl(source.url),
    )
    .map((source) => createPromptSource(source));
  return [...builtIn, ...custom];
}

export function waitPromptSourceStoreHydrated(): Promise<void> {
  return new Promise((resolve) => {
    if (usePromptSourceStore.getState().hydrated) {
      resolve();
      return;
    }
    const unsub = usePromptSourceStore.subscribe((state) => {
      if (!state.hydrated) return;
      unsub();
      resolve();
    });
  });
}

export const usePromptSourceStore = create<PromptSourceStore>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_PROMPT_SOURCES,
      loaded: false,
      hydrated: false,
      loadSources: async () => {
        await waitPromptSourceStoreHydrated();
        const sources = mergeWithDefaults(get().sources);
        set({ sources, loaded: true });
      },
      syncSources: async () => {
        await waitPromptSourceStoreHydrated();
        const { refreshAllSources } = await import("@canvas/services/api/prompts");
        const sources = mergeWithDefaults(get().sources);
        set({ sources, loaded: true });
        await refreshAllSources();
        return get().sources;
      },
      addSource: () => createPromptSource(),
      saveSource: async (source) => {
        const next = createPromptSource(source);
        set((state) => ({
          sources: state.sources.some((item) => item.id === next.id)
            ? state.sources.map((item) =>
                item.id === next.id ? (item.builtIn ? { ...item, enabled: next.enabled } : next) : item,
              )
            : [...state.sources, next],
        }));
      },
      removeSource: async (id) => {
        const target = get().sources.find((item) => item.id === id);
        if (!target || target.builtIn) return;
        set((state) => ({ sources: state.sources.filter((item) => item.id !== id) }));
      },
      toggleSource: async (id, enabled) => {
        set((state) => ({
          sources: state.sources.map((item) => (item.id === id ? { ...item, enabled } : item)),
        }));
      },
      setSources: (sources) => set({ sources: mergeWithDefaults(sources), loaded: true }),
    }),
    {
      name: "minimalist-canvas:prompt_source_store",
      storage: createJSONStorage(() => localForageStorage),
      partialize: (state) => ({ sources: state.sources }),
      merge: (persisted, current) => {
        const saved = (persisted as { sources?: PromptSource[] } | undefined)?.sources;
        return {
          ...current,
          ...(persisted as object),
          sources: mergeWithDefaults(Array.isArray(saved) ? saved : current.sources),
        };
      },
      onRehydrateStorage: () => () => {
        usePromptSourceStore.setState({ hydrated: true, loaded: true });
      },
    },
  ),
);
