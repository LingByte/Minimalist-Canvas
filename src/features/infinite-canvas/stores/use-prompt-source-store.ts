import { create } from "zustand";

import {
  createPromptSourceRemote,
  deletePromptSourceRemote,
  fetchPromptSources,
  setPromptSourceEnabled,
  updatePromptSourceRemote,
} from "@canvas/services/api/prompts";
import { createPromptSource, type PromptSource } from "@canvas/services/api/prompt-source-presets";

type PromptSourceStore = {
  sources: PromptSource[];
  loaded: boolean;
  loadSources: () => Promise<void>;
  addSource: () => PromptSource;
  saveSource: (source: PromptSource) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => Promise<void>;
  setSources: (sources: PromptSource[]) => void;
};

let loadingPromise: Promise<void> | null = null;

export const usePromptSourceStore = create<PromptSourceStore>((set, get) => ({
  sources: [],
  loaded: false,
  loadSources: async () => {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const sources = await fetchPromptSources();
        set({ sources, loaded: true });
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
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
}));
