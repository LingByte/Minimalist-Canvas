import { createZip } from "@canvas/lib/zip";

import mediaSkillMd from "../../../../skills/minimalist-canvas-media/SKILL.md?raw";
import mediaSkillScript from "../../../../skills/minimalist-canvas-media/scripts/canvas-media.mjs?raw";

import gameSkillMd from "../../../../skills/minimalist-canvas-game-assets/SKILL.md?raw";
import gameRoutes from "../../../../skills/minimalist-canvas-game-assets/references/routes.md?raw";
import gameCharacterSheet from "../../../../skills/minimalist-canvas-game-assets/references/character-sheet.md?raw";
import gameActionPack from "../../../../skills/minimalist-canvas-game-assets/references/action-pack.md?raw";
import gameEffectsProps from "../../../../skills/minimalist-canvas-game-assets/references/effects-props.md?raw";
import gamePromptPatterns from "../../../../skills/minimalist-canvas-game-assets/references/prompt-patterns.md?raw";
import gameSkillScript from "../../../../skills/minimalist-canvas-game-assets/scripts/game-assets.mjs?raw";

export type ExternalSkillFile = {
    path: string;
    content: string;
};

export type ExternalSkillPackId = "media" | "game-assets";

export type ExternalSkillPack = {
    id: ExternalSkillPackId;
    name: string;
    githubPath: string;
    pillar: "novel" | "drama" | "assets" | "media";
    files: ExternalSkillFile[];
    smokeCommand: (skillFolder: string) => string;
};

function installMarkdown(name: string, treeHint: string, smoke: string) {
    return `# Install (Agent Skills)

This zip is a standard Agent Skills package:

\`\`\`
${treeHint}
\`\`\`

Put the folder into any skills directory your agent reads:

| Tool | Project | User / global |
|------|---------|---------------|
| Generic / Codex | \`./skills/\` | — |
| Cursor | \`.cursor/skills/\` | \`~/.cursor/skills/\` |
| Claude Code | \`.claude/skills/\` | \`~/.claude/skills/\` |

\`\`\`bash
unzip -o ${name}.zip
cp -R ${name} .cursor/skills/   # or .claude/skills / skills
\`\`\`

## How it works

Keep **Minimalist Canvas desktop running**. The app listens on \`http://127.0.0.1:17373\`
and proxies generation through your live channel config.

\`\`\`bash
${smoke}
\`\`\`

Or: \`npx skills add LingByte/Minimalist-Canvas --skill ${name} -g -y\`
`;
}

const mediaFilesBase: ExternalSkillFile[] = [
    { path: "SKILL.md", content: mediaSkillMd },
    { path: "scripts/canvas-media.mjs", content: mediaSkillScript },
];

const gameFilesBase: ExternalSkillFile[] = [
    { path: "SKILL.md", content: gameSkillMd },
    { path: "references/routes.md", content: gameRoutes },
    { path: "references/character-sheet.md", content: gameCharacterSheet },
    { path: "references/action-pack.md", content: gameActionPack },
    { path: "references/effects-props.md", content: gameEffectsProps },
    { path: "references/prompt-patterns.md", content: gamePromptPatterns },
    { path: "scripts/game-assets.mjs", content: gameSkillScript },
];

function withInstall(name: string, files: ExternalSkillFile[], smoke: string): ExternalSkillFile[] {
    const treeHint = `${name}/\n${files
        .map((file) => {
            const parts = file.path.split("/");
            return `${"  ".repeat(parts.length - 1)}├── ${parts[parts.length - 1]}`;
        })
        .join("\n")}`;
    return [{ path: "INSTALL.md", content: installMarkdown(name, treeHint, smoke) }, ...files];
}

export const EXTERNAL_SKILL_PACKS: ExternalSkillPack[] = [
    {
        id: "media",
        name: "minimalist-canvas-media",
        githubPath: "skills/minimalist-canvas-media",
        pillar: "media",
        files: withInstall(
            "minimalist-canvas-media",
            mediaFilesBase,
            `node minimalist-canvas-media/scripts/canvas-media.mjs health
node minimalist-canvas-media/scripts/canvas-media.mjs image --prompt "海报" --out ./out.png`,
        ),
        smokeCommand: (folder) => `node ${folder}/scripts/canvas-media.mjs image --prompt "海报" --out ./out.png`,
    },
    {
        id: "game-assets",
        name: "minimalist-canvas-game-assets",
        githubPath: "skills/minimalist-canvas-game-assets",
        pillar: "assets",
        files: withInstall(
            "minimalist-canvas-game-assets",
            gameFilesBase,
            `node minimalist-canvas-game-assets/scripts/game-assets.mjs health
node minimalist-canvas-game-assets/scripts/game-assets.mjs layout --name hero --out ./game-assets`,
        ),
        smokeCommand: (folder) =>
            `node ${folder}/scripts/game-assets.mjs layout --name hero --out ./game-assets`,
    },
];

export function getExternalSkillPack(id: ExternalSkillPackId | string) {
    return EXTERNAL_SKILL_PACKS.find((pack) => pack.id === id) || EXTERNAL_SKILL_PACKS[0];
}

export function parseExternalSkillFrontmatter(markdown: string, fallbackName: string) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { name: fallbackName, description: "", body: markdown };
    const yaml = match[1];
    const body = match[2].trimStart();
    const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() || fallbackName;
    const descriptionBlock = yaml.match(/^description:\s*>-\s*\n((?:[ \t]+.+\n?)+)/m)?.[1];
    const descriptionInline = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    const description = (descriptionBlock || descriptionInline || "")
        .split("\n")
        .map((line) => line.replace(/^[ \t]+/, "").trimEnd())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    return { name, description, body };
}

export function formatExternalSkillTree(name: string, files: ExternalSkillFile[]) {
    const lines = [`${name}/`];
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const dirs = new Set<string>();
    for (const file of sorted) {
        const parts = file.path.split("/");
        for (let i = 0; i < parts.length - 1; i += 1) {
            const dir = parts.slice(0, i + 1).join("/");
            if (dirs.has(dir)) continue;
            dirs.add(dir);
            lines.push(`${"  ".repeat(i)}├── ${parts[i]}/`);
        }
        const depth = parts.length - 1;
        lines.push(`${"  ".repeat(depth)}├── ${parts[depth]}`);
    }
    return lines.join("\n");
}

export async function buildExternalSkillPackZip(pack: ExternalSkillPack) {
    return createZip(
        pack.files.map((file) => ({
            name: `${pack.name}/${file.path}`,
            data: file.content,
        })),
    );
}

/** @deprecated Prefer EXTERNAL_SKILL_PACKS / getExternalSkillPack */
export const EXTERNAL_MEDIA_SKILL_NAME = "minimalist-canvas-media";
export const EXTERNAL_MEDIA_SKILL_ZIP = `${EXTERNAL_MEDIA_SKILL_NAME}.zip`;
export const EXTERNAL_MEDIA_SKILL_FILES = getExternalSkillPack("media").files;
export async function buildExternalMediaSkillZip() {
    return buildExternalSkillPackZip(getExternalSkillPack("media"));
}
