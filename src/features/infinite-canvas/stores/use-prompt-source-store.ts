import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  createPromptSourceRemote,
  deletePromptSourceRemote,
  fetchPromptSources,
  setPromptSourceEnabled,
  updatePromptSourceRemote,
} from "@canvas/services/api/prompts";
import { createPromptSource, type PromptSource } from "@canvas/services/api/prompt-source-presets";
import { localForageStorage } from "@canvas/lib/localforage-storage";

type PromptSourceStore = {
  sources: PromptSource[];
  loaded: boolean;
  hydrated: boolean;
  loadSources: () => Promise<void>;
  syncSources: () => Promise<PromptSource[]>;
  addSource: () => PromptSource;
  saveSource: (source: PromptSource) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => Promise<void>;
  setSources: (sources: PromptSource[]) => void;
};

let loadingPromise: Promise<void> | null = null;
let syncingPromise: Promise<PromptSource[]> | null = null;

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
      sources: [],
      loaded: false,
      hydrated: false,
      // Local-first: after hydration, keep using the persisted list and only
      // hit the remote when nothing is stored (first run or emptied list).
      loadSources: async () => {
        if (loadingPromise) return loadingPromise;
        loadingPromise = (async () => {
          try {
            await waitPromptSourceStoreHydrated();
            if (get().sources.length > 0) {
              set({ loaded: true });
              return;
            }
            const sources = await fetchPromptSources();
            set({ sources, loaded: true });
          } finally {
            loadingPromise = null;
          }
        })();
        return loadingPromise;
      },
      // Manual sync: always pulls the remote list and overwrites local state.
      syncSources: async () => {
        if (syncingPromise) return syncingPromise;
        syncingPromise = (async () => {
          try {
            const sources = await fetchPromptSources();
            set({ sources, loaded: true });
            return sources;
          } finally {
            syncingPromise = null;
          }
        })();
        return syncingPromise;
      },
      addSource: () => createPromptSource(),
      saveSource: async (source) => {
        const existing = get().sources.find((item) => item.id === source.id);
        const saved =
          existing && !existing.builtIn
            ? await updatePromptSourceRemote(source)
            : existing?.builtIn
              ? existing
              : await createPromptSourceRemote(source);
        set((state) => ({
          sources: state.sources.some((item) => item.id === saved.id)
            ? state.sources.map((item) => (item.id === saved.id ? saved : item))
            : [...state.sources, saved],
        }));
      },
      removeSource: async (id) => {
        const target = get().sources.find((item) => item.id === id);
        if (!target || target.builtIn) return;
        await deletePromptSourceRemote(id);
        set((state) => ({ sources: state.sources.filter((item) => item.id !== id) }));
      },
      toggleSource: async (id, enabled) => {
        await setPromptSourceEnabled(id, enabled);
        set((state) => ({
          sources: state.sources.map((item) => (item.id === id ? { ...item, enabled } : item)),
        }));
      },
      setSources: (sources) => set({ sources, loaded: true }),
    }),
    {
      name: "minimalist-canvas:prompt_source_store",
      storage: createJSONStorage(() => localForageStorage),
      partialize: (state) => ({ sources: state.sources }),
      onRehydrateStorage: () => () => {
        usePromptSourceStore.setState({ hydrated: true });
      },
    },
  ),
);
