import { useThemeStore } from "@canvas/stores/use-theme-store";

export function useActiveTheme() {
    return useThemeStore((state) => state.theme);
}
