import i18n from "@canvas/i18n";
import { isTauri, storageRoot } from "@canvas/services/fs-store";

export type BuiltinSkill = {
    name: string;
    description: string;
    instructions: string;
    path: string;
};

/**
 * Load local skills from {storageRoot}/skills/{name}/SKILL.md.
 * Format mirrors Claude Code skills: YAML-like frontmatter (name, description)
 * followed by markdown instructions.
 */
export async function loadBuiltinSkills(): Promise<{ skills: BuiltinSkill[]; error?: string }> {
    if (!isTauri()) return { skills: [] };
    try {
        const { readDir, readTextFile, exists } = await import("@tauri-apps/plugin-fs");
        const root = await storageRoot();
        if (!root) return { skills: [] };
        const skillsDir = `${root.replace(/[/\\]+$/, "")}/skills`;
        if (!(await exists(skillsDir))) return { skills: [] };
        const entries = await readDir(skillsDir);
        const skills: BuiltinSkill[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory) continue;
            const path = `${skillsDir}/${entry.name}/SKILL.md`;
            if (!(await exists(path))) continue;
            try {
                const parsed = parseSkillFile(await readTextFile(path), entry.name);
                if (parsed) skills.push({ ...parsed, path });
            } catch {
                // skip unreadable skill files
            }
        }
        skills.sort((a, b) => a.name.localeCompare(b.name));
        return { skills };
    } catch (error) {
        return { skills: [], error: error instanceof Error ? error.message : i18n.t("agent.state.skillReadFailed") };
    }
}

export function parseSkillFile(content: string, dirName: string): Omit<BuiltinSkill, "path"> | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta = match ? parseFrontmatter(match[1]) : {};
    const instructions = (match ? match[2] : content).trim();
    const name = (meta.name || dirName).trim();
    if (!name || !instructions) return null;
    return { name, description: (meta.description || "").trim(), instructions };
}

function parseFrontmatter(text: string): Record<string, string> {
    const meta: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (!match) continue;
        meta[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
    return meta;
}
