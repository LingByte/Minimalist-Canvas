import { create } from "zustand";

export const CANVAS_SIDE_PANEL_MOTION_MS = 500;
export const CANVAS_SIDE_PANEL_MIN_WIDTH = 220;
export const CANVAS_SIDE_PANEL_MAX_WIDTH = 480;
export const CANVAS_SIDE_PANEL_DEFAULT_WIDTH = 280;

/** Elements drawer only — prompts/logs open as separate drawers from the toolbar. */
export type CanvasSidePanelTab = "canvas" | "prompts" | "logs";

const OPEN_KEY = "canvas-side-panel-open";

/** Elements drawer starts closed; opened from the top-left chip button. */
function initialOpen() {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(OPEN_KEY) === "1";
}

type CanvasSidePanelStore = {
    panelOpen: boolean;
    requestedTab: CanvasSidePanelTab | null;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    requestTab: (tab: CanvasSidePanelTab) => void;
    clearRequestedTab: () => void;
};

export const useCanvasSidePanelStore = create<CanvasSidePanelStore>((set, get) => ({
    panelOpen: initialOpen(),
    requestedTab: null,
    openPanel: () => {
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "1");
        set({ panelOpen: true });
    },
    closePanel: () => {
        if (typeof window !== "undefined") localStorage.setItem(OPEN_KEY, "0");
        set({ panelOpen: false });
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
    requestTab: (tab) => set({ requestedTab: tab }),
    clearRequestedTab: () => set({ requestedTab: null }),
}));
