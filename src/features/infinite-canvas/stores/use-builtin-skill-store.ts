import { create } from "zustand";

import { loadBuiltinSkills, type BuiltinSkill } from "@canvas/lib/agent/builtin-skills";

const STORAGE_KEY = "canvas-builtin-skill";

type BuiltinSkillStore = {
    skills: BuiltinSkill[];
    selectedName: string;
    loading: boolean;
    loaded: boolean;
    error: string;
    load: (force?: boolean) => Promise<void>;
    select: (name: string) => void;
};

export const useBuiltinSkillStore = create<BuiltinSkillStore>((set, get) => ({
    skills: [],
    selectedName: typeof window === "undefined" ? "" : localStorage.getItem(STORAGE_KEY) || "",
    loading: false,
    loaded: false,
    error: "",
    load: async (force = false) => {
        if (get().loading || (get().loaded && !force)) return;
        set({ loading: true });
        const { skills, error } = await loadBuiltinSkills();
        const selectedName = get().selectedName;
        set({
            skills,
            loading: false,
            loaded: true,
            error: error || "",
            selectedName: skills.some((skill) => skill.name === selectedName) ? selectedName : "",
        });
        if (!skills.some((skill) => skill.name === get().selectedName) && get().selectedName) {
            localStorage.removeItem(STORAGE_KEY);
        }
    },
    select: (name) => {
        set({ selectedName: name });
        try {
            if (name) localStorage.setItem(STORAGE_KEY, name);
            else localStorage.removeItem(STORAGE_KEY);
        } catch {
            // storage unavailable
        }
    },
}));

/** Instructions of the selected skill, injected into the agent system prompt. */
export function selectedBuiltinSkillPrompt(): string {
    const { skills, selectedName } = useBuiltinSkillStore.getState();
    const skill = skills.find((item) => item.name === selectedName);
    if (!skill) return "";
    return `The user selected the "${skill.name}" skill. Follow these instructions:\n\n${skill.instructions}`;
}
