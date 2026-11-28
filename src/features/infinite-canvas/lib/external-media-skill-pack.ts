import { createZip } from "@canvas/lib/zip";

import skillMd from "../../../../skills/minimalist-canvas-media/SKILL.md?raw";
import skillScript from "../../../../skills/minimalist-canvas-media/scripts/canvas-media.mjs?raw";

export const EXTERNAL_MEDIA_SKILL_NAME = "minimalist-canvas-media";
export const EXTERNAL_MEDIA_SKILL_ZIP = `${EXTERNAL_MEDIA_SKILL_NAME}.zip`;

export type ExternalSkillFile = {
    path: string;
    content: string;
};

const INSTALL_MD = `# Install (Agent Skills)

This zip is a standard Agent Skills package:

\`\`\`
${EXTERNAL_MEDIA_SKILL_NAME}/
├── SKILL.md
├── INSTALL.md
└── scripts/
    └── canvas-media.mjs
\`\`\`

Put the folder into any skills directory your agent reads:

| Tool | Project | User / global |
|------|---------|---------------|
| Generic / Codex | \`./skills/\` | — |
| Cursor | \`.cursor/skills/\` | \`~/.cursor/skills/\` |
| Claude Code | \`.claude/skills/\` | \`~/.claude/skills/\` |

\`\`\`bash
unzip -o ${EXTERNAL_MEDIA_SKILL_ZIP}
cp -R ${EXTERNAL_MEDIA_SKILL_NAME} .cursor/skills/   # or .claude/skills / skills
\`\`\`

## How it works

Keep **Minimalist Canvas desktop running**. The app listens on \`http://127.0.0.1:17373\`
and proxies image/video through your live channel config. The skill CLI only calls that API.

\`\`\`bash
node ${EXTERNAL_MEDIA_SKILL_NAME}/scripts/canvas-media.mjs health
node ${EXTERNAL_MEDIA_SKILL_NAME}/scripts/canvas-media.mjs image --prompt "海报" --out ./out.png
\`\`\`

Or: \`npx skills add LingByte/Minimalist-Canvas --skill ${EXTERNAL_MEDIA_SKILL_NAME} -g -y\`
`;

/** Files shipped in the downloadable skill package (preview + zip share this source). */
export const EXTERNAL_MEDIA_SKILL_FILES: ExternalSkillFile[] = [
    { path: "SKILL.md", content: skillMd },
    { path: "INSTALL.md", content: INSTALL_MD },
    { path: "scripts/canvas-media.mjs", content: skillScript },
];

export function parseExternalSkillFrontmatter(markdown: string) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { name: EXTERNAL_MEDIA_SKILL_NAME, description: "", body: markdown };
    const yaml = match[1];
    const body = match[2].trimStart();
    const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() || EXTERNAL_MEDIA_SKILL_NAME;
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

/** Build a standard Agent Skills zip. */
export async function buildExternalMediaSkillZip() {
    return createZip(
        EXTERNAL_MEDIA_SKILL_FILES.map((file) => ({
            name: `${EXTERNAL_MEDIA_SKILL_NAME}/${file.path}`,
            data: file.content,
        })),
    );
}
