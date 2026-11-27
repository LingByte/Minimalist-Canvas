import { isShippedBuiltinSkill, type BuiltinSkill } from "@canvas/lib/agent/builtin-skills";

/** Coarse groups for the skills library — keeps 50+ packs browsable. */
export type SkillCategoryId =
    | "short-drama"
    | "novel"
    | "production"
    | "craft"
    | "style"
    | "canvas"
    | "installed";

export const SKILL_CATEGORY_ORDER: SkillCategoryId[] = [
    "short-drama",
    "novel",
    "production",
    "craft",
    "style",
    "canvas",
    "installed",
];

const STYLE_SKILLS = new Set([
    "chekhov-dramaturgy",
    "ozu-screenplay-style",
    "succession-series-writing",
    "screenwriting-master",
]);

const PRODUCTION_SKILLS = new Set(["story-to-script", "write-screenplay", "script-generation"]);

export function skillCategory(skill: Pick<BuiltinSkill, "name" | "path">): SkillCategoryId {
    if (!isShippedBuiltinSkill(skill)) return "installed";

    const name = skill.name;
    if (name === "short-drama" || name.startsWith("short-drama-")) return "short-drama";
    if (name.startsWith("novel-") || name === "character-refs") return "novel";
    if (PRODUCTION_SKILLS.has(name)) return "production";
    if (name.startsWith("sw-")) return "craft";
    if (STYLE_SKILLS.has(name)) return "style";
    if (name === "meme-storyboard" || (skill.path.startsWith("shipped:") && !skill.path.includes("bundled/"))) {
        return "canvas";
    }
    return "craft";
}

export function groupSkillsByCategory<T extends Pick<BuiltinSkill, "name" | "path">>(skills: T[]) {
    const buckets = new Map<SkillCategoryId, T[]>();
    for (const id of SKILL_CATEGORY_ORDER) buckets.set(id, []);
    for (const skill of skills) {
        const id = skillCategory(skill);
        buckets.get(id)!.push(skill);
    }
    return SKILL_CATEGORY_ORDER.map((id) => ({ id, skills: buckets.get(id) || [] })).filter((group) => group.skills.length > 0);
}
