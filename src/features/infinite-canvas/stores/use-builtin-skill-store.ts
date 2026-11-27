import { create } from "zustand";

import {
    formatSkillPackageTree,
    installBuiltinSkill,
    installBuiltinSkillFromZip,
    loadBuiltinSkills,
    uninstallBuiltinSkill,
    type BuiltinSkill,
    type BuiltinSkillInput,
    type BuiltinSkillInstallResult,
} from "@canvas/lib/agent/builtin-skills";

const STORAGE_KEY = "canvas-builtin-skill";

type BuiltinSkillStore = {
    skills: BuiltinSkill[];
    selectedName: string;
    loading: boolean;
    loaded: boolean;
    error: string;
    load: (force?: boolean) => Promise<void>;
    select: (name: string) => void;
    install: (input: BuiltinSkillInput) => Promise<BuiltinSkill>;
    installZip: (bytes: Uint8Array, fallbackName?: string) => Promise<BuiltinSkillInstallResult>;
    uninstall: (name: string) => Promise<void>;
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
        const nextSelected = skills.some((skill) => skill.name === selectedName) ? selectedName : "";
        set({
            skills,
            loading: false,
            loaded: true,
            error: error || "",
            selectedName: nextSelected,
        });
        if (!nextSelected && selectedName) {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch {
                // storage unavailable
            }
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
    install: async (input) => {
        const skill = await installBuiltinSkill(input);
        await get().load(true);
        get().select(skill.name);
        return skill;
    },
    installZip: async (bytes, fallbackName) => {
        const skill = await installBuiltinSkillFromZip(bytes, fallbackName);
        await get().load(true);
        get().select(skill.name);
        return skill;
    },
    uninstall: async (name) => {
        await uninstallBuiltinSkill(name);
        if (get().selectedName === name) get().select("");
        await get().load(true);
    },
}));

/** Instructions of the selected skill, injected into the agent system prompt. */
export function selectedBuiltinSkillPrompt(): string {
    const { skills, selectedName } = useBuiltinSkillStore.getState();
    const skill = skills.find((item) => item.name === selectedName);
    if (!skill) return "";
    const tree = formatSkillPackageTree(skill.name, skill.packageEntries);
    const fileNames = Object.keys(skill.files || {});
    const referenceSnippets = fileNames
        .filter((name) => name.toLowerCase().startsWith("references/") && name.toLowerCase().endsWith(".md"))
        .slice(0, 3)
        .map((name) => {
            const body = (skill.files?.[name] || "").trim();
            if (!body) return "";
            const clipped = body.length > 1200 ? `${body.slice(0, 1200)}…` : body;
            return `\n\n### ${name}\n${clipped}`;
        })
        .filter(Boolean)
        .join("");
    return `The user selected the "${skill.name}" skill. Follow these instructions:\n\n${skill.instructions}\n\nPackage structure (read-only; scripts are never auto-executed):\n${tree}${referenceSnippets}`;
}

export function builtinSkillToSummary(skill: BuiltinSkill) {
    return {
        name: skill.name,
        description: skill.description,
        shortDescription: skill.description,
        interface: {
            displayName: skill.name,
            shortDescription: skill.description,
            defaultPrompt: "",
        },
        path: skill.path,
        scope: "user" as const,
        enabled: true,
        managed: true,
    };
}
