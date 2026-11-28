import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@canvas/lib/localforage-storage";

export const TOOLS_SIDEBAR_WIDTH_MIN = 168;
export const TOOLS_SIDEBAR_WIDTH_MAX = 320;
export const TOOLS_SIDEBAR_WIDTH_DEFAULT = 200;
export const TOOLS_SIDEBAR_COLLAPSED_WIDTH = 56;

type ToolsSidebarStore = {
    collapsed: boolean;
    width: number;
    setCollapsed: (collapsed: boolean) => void;
    toggleCollapsed: () => void;
    setWidth: (width: number) => void;
};

function clampWidth(width: number) {
    return Math.min(TOOLS_SIDEBAR_WIDTH_MAX, Math.max(TOOLS_SIDEBAR_WIDTH_MIN, Math.round(width)));
}

export const useToolsSidebarStore = create<ToolsSidebarStore>()(
    persist(
        (set, get) => ({
            collapsed: false,
            width: TOOLS_SIDEBAR_WIDTH_DEFAULT,
            setCollapsed: (collapsed) => set({ collapsed }),
            toggleCollapsed: () => set({ collapsed: !get().collapsed }),
            setWidth: (width) => set({ width: clampWidth(width), collapsed: false }),
        }),
        {
            name: "minimalist-canvas:tools_sidebar_store",
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ collapsed: state.collapsed, width: state.width }),
        },
    ),
);
