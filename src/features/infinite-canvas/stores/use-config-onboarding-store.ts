import { create } from "zustand";

import type { ConfigTabKey } from "@canvas/stores/use-config-store";

export const CONFIG_ONBOARDING_STORAGE_KEY = "minimalist-canvas:config-onboarding-v1";

export type ConfigOnboardingStepId = "welcome" | "settings" | "channels" | "baseUrl" | "apiKey" | "preferences" | "retention" | "generationLogs" | "done";

export const CONFIG_ONBOARDING_STEPS: ConfigOnboardingStepId[] = ["welcome", "settings", "channels", "baseUrl", "apiKey", "preferences", "retention", "generationLogs", "done"];

type ConfigOnboardingStore = {
    active: boolean;
    stepIndex: number;
    forceTab: ConfigTabKey | null;
    forceEditingChannelId: string | null;
    start: () => void;
    stop: (markSeen?: boolean) => void;
    next: () => void;
    prev: () => void;
    goTo: (stepId: ConfigOnboardingStepId) => void;
    setForceTab: (tab: ConfigTabKey | null) => void;
    setForceEditingChannelId: (id: string | null) => void;
};

export function hasSeenConfigOnboarding() {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(CONFIG_ONBOARDING_STORAGE_KEY) === "1";
    } catch {
        return true;
    }
}

export function markConfigOnboardingSeen() {
    try {
        window.localStorage.setItem(CONFIG_ONBOARDING_STORAGE_KEY, "1");
    } catch {
        // ignore quota / private mode
    }
}

export function clearConfigOnboardingSeen() {
    try {
        window.localStorage.removeItem(CONFIG_ONBOARDING_STORAGE_KEY);
    } catch {
        // ignore
    }
}

export const useConfigOnboardingStore = create<ConfigOnboardingStore>((set, get) => ({
    active: false,
    stepIndex: 0,
    forceTab: null,
    forceEditingChannelId: null,
    start: () => set({ active: true, stepIndex: 0, forceTab: null, forceEditingChannelId: null }),
    stop: (markSeen = true) => {
        if (markSeen) markConfigOnboardingSeen();
        set({ active: false, stepIndex: 0, forceTab: null, forceEditingChannelId: null });
    },
    next: () => {
        const { stepIndex } = get();
        if (stepIndex >= CONFIG_ONBOARDING_STEPS.length - 1) {
            get().stop(true);
            return;
        }
        set({ stepIndex: stepIndex + 1 });
    },
    prev: () => {
        const { stepIndex } = get();
        if (stepIndex <= 0) return;
        set({ stepIndex: stepIndex - 1 });
    },
    goTo: (stepId) => {
        const index = CONFIG_ONBOARDING_STEPS.indexOf(stepId);
        if (index < 0) return;
        set({ stepIndex: index });
    },
    setForceTab: (forceTab) => set({ forceTab }),
    setForceEditingChannelId: (forceEditingChannelId) => set({ forceEditingChannelId }),
}));

export function currentOnboardingStep(stepIndex: number): ConfigOnboardingStepId {
    return CONFIG_ONBOARDING_STEPS[stepIndex] || "welcome";
}
