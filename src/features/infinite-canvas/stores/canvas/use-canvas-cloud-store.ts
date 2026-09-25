import { create } from "zustand";

import { listUserCanvasProjects, type UserCanvasProjectSummary } from "@canvas/services/api/user-canvas-projects";
import { pullCanvasProjectFromCloud } from "@canvas/services/user-canvas-project-sync";
import type { CanvasProject } from "@canvas/stores/canvas/use-canvas-store";

type CanvasCloudStore = {
    summaries: UserCanvasProjectSummary[];
    loading: boolean;
    loaded: boolean;
    pullingId: string | null;
    refresh: () => Promise<void>;
    pull: (clientId: string) => Promise<CanvasProject | null>;
};

/** Cloud-side canvas list — fetched on demand, separate from the local project store. */
export const useCanvasCloudStore = create<CanvasCloudStore>()((set, get) => ({
    summaries: [],
    loading: false,
    loaded: false,
    pullingId: null,
    refresh: async () => {
        if (get().loading) return;
        set({ loading: true });
        const items = await listUserCanvasProjects();
        set({ summaries: items, loading: false, loaded: true });
    },
    pull: async (clientId) => {
        if (!clientId || get().pullingId) return null;
        set({ pullingId: clientId });
        try {
            return await pullCanvasProjectFromCloud(clientId);
        } finally {
            set({ pullingId: null });
        }
    },
}));
