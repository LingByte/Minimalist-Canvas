import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            // Default light so embedded canvas never flashes dark before host sync.
            // When embedded, useHostThemeSync overwrites this from the host cookie.
            theme: "light",
            setTheme: (theme) => set({ theme }),
        }),
        { name: "minimalist-canvas:theme_store" },
    ),
);
