import type { StateStorage } from "zustand/middleware";

import { appStateStorage } from "@canvas/services/fs-store";

/**
 * Persist backend for zustand stores. In the desktop app this writes JSON files
 * under the app storage root; in plain web builds it falls back to IndexedDB.
 */
export const localForageStorage: StateStorage = {
    getItem: (name) => appStateStorage.getItem(name),
    setItem: async (name, value) => {
        await appStateStorage.setItem(name, value);
    },
    removeItem: (name) => appStateStorage.removeItem(name),
};
