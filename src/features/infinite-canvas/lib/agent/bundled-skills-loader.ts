import type { BuiltinSkill, BuiltinSkillPackageEntry } from "@canvas/lib/agent/builtin-skills";

/**
 * Build-time bundled screenwriting skills under skills/bundled/.
 * Synced via: bun scripts/sync-bundled-skills.mjs [--fetch]
 *
 * Kept free of imports from builtin-skills runtime helpers to avoid circular deps.
 */
const skillMdModules = import.meta.glob("../../../../../skills/bundled/*/SKILL.md", {
    query: "?raw",
    eager: true,
    import: "default",
}) as Record<string, string>;

const referenceModules = import.meta.glob(
    "../../../../../skills/bundled/*/references/**/*.{md,txt,json,yml,yaml,toml,csv,tsv}",
    {
        query: "?raw",
        eager: true,
        import: "default",
    },
) as Record<string, string>;

let cached: BuiltinSkill[] | null = null;

export function loadBundledShippedSkills(): BuiltinSkill[] {
    if (cached) return cached;
    const byDir = new Map<string, { skillMd?: string; files: Record<string, string> }>();

    for (const [modulePath, content] of Object.entries(skillMdModules)) {
        const dir = skillDirFromModulePath(modulePath);
        if (!dir) continue;
        const entry = byDir.get(dir) || { files: {} };
        entry.skillMd = asText(content);
        byDir.set(dir, entry);
    }

    for (const [modulePath, content] of Object.entries(referenceModules)) {
        const dir = skillDirFromModulePath(modulePath);
        if (!dir) continue;
        const relative = relativeUnderSkill(modulePath, dir);
        if (!relative) continue;
        const entry = byDir.get(dir) || { files: {} };
        entry.files[relative] = asText(content);
        byDir.set(dir, entry);
    }

    const skills: BuiltinSkill[] = [];
    for (const [dir, payload] of byDir) {
        if (!payload.skillMd?.trim()) continue;
        const parsed = parseSkillMarkdown(payload.skillMd, dir);
        if (!parsed) continue;
        const files = payload.files;
        const packageEntries = buildEntries(files, payload.skillMd.length);
        skills.push({
            ...parsed,
            path: `shipped:bundled/${parsed.name}`,
            ...(Object.keys(files).length ? { files } : {}),
            ...(packageEntries.length ? { packageEntries } : {}),
        });
    }

    cached = skills.sort((a, b) => a.name.localeCompare(b.name));
    return cached;
}

function asText(value: unknown) {
    return typeof value === "string" ? value : String(value ?? "");
}

function skillDirFromModulePath(modulePath: string) {
    const marker = "/skills/bundled/";
    const normalized = modulePath.replace(/\\/g, "/");
    const idx = normalized.indexOf(marker);
    if (idx < 0) return "";
    return normalized.slice(idx + marker.length).split("/")[0] || "";
}

function relativeUnderSkill(modulePath: string, dir: string) {
    const marker = `/skills/bundled/${dir}/`;
    const normalized = modulePath.replace(/\\/g, "/");
    const idx = normalized.indexOf(marker);
    if (idx < 0) return "";
    return normalized.slice(idx + marker.length);
}

function normalizeName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function parseSkillMarkdown(content: string, dirName: string): Omit<BuiltinSkill, "path"> | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const meta: Record<string, string> = {};
    if (match) {
        for (const line of match[1].split(/\r?\n/)) {
            const idx = line.indexOf(":");
            if (idx <= 0) continue;
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            if (key) meta[key] = value;
        }
    }
    const instructions = (match ? match[2] : content).trim();
    const name = normalizeName(meta.name || dirName);
    if (!name || !instructions) return null;
    return { name, description: (meta.description || "").trim(), instructions };
}

function buildEntries(files: Record<string, string>, skillMdBytes: number): BuiltinSkillPackageEntry[] {
    const entries: BuiltinSkillPackageEntry[] = [
        { path: "SKILL.md", bytes: skillMdBytes, role: "skill", encoding: "text" },
    ];
    for (const [path, body] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
        const role = path.startsWith("references/") ? "reference" : path.startsWith("scripts/") ? "script" : path.startsWith("assets/") ? "asset" : "other";
        entries.push({
            path,
            bytes: new TextEncoder().encode(body).byteLength,
            role,
            encoding: "text",
        });
    }
    return entries;
}
