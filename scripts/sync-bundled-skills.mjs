#!/usr/bin/env bun
/**
 * Sync vendored screenwriting skill repos into skills/bundled/ for in-app shipping.
 *
 * Prerequisites: clones under skills/_vendor/ (see skills/README.md).
 * Copies SKILL.md + references/ (+ templates/ as references/templates/).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(root, "skills/_vendor");
const outDir = join(root, "skills/bundled");
const TEXT_RE = /\.(md|txt|json|ya?ml|toml|csv|tsv)$/i;

function ensureVendor() {
    if (!existsSync(vendorDir)) mkdirSync(vendorDir, { recursive: true });
    const repos = [
        ["https://github.com/eternityspring/shuohao-skills.git", "shuohao-skills"],
        ["https://github.com/zenstory-ai/drama-skills.git", "drama-skills"],
        ["https://github.com/jtydhr88/screenwriting-skills.git", "screenwriting-skills"],
        ["https://github.com/Shanyin-ai/shanyin-screenwriting-master.git", "shanyin-screenwriting-master"],
        ["https://github.com/oleo17/story-to-script.git", "story-to-script"],
        ["https://github.com/egguy886/write-screenplay-skill.git", "write-screenplay-skill"],
    ];
    for (const [url, name] of repos) {
        const dest = join(vendorDir, name);
        if (existsSync(join(dest, ".git"))) {
            console.log(`pull ${name}`);
            try {
                execSync("git pull --ff-only", { cwd: dest, stdio: "inherit" });
            } catch {
                console.warn(`warn: pull failed for ${name}`);
            }
        } else {
            console.log(`clone ${name}`);
            execSync(`git clone --depth 1 ${url} ${JSON.stringify(dest)}`, { stdio: "inherit" });
        }
    }
}

function findSkillDirs(base) {
    const results = [];
    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "maintainers") continue;
            const full = join(dir, entry.name);
            if (!entry.isDirectory()) continue;
            if (existsSync(join(full, "SKILL.md"))) results.push(full);
            else walk(full);
        }
    };
    walk(base);
    return results;
}

function normalizeName(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function parseFrontmatterName(skillMdPath, fallback) {
    const raw = readFileSync(skillMdPath, "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return normalizeName(fallback);
    const nameLine = match[1].split(/\r?\n/).find((line) => line.startsWith("name:"));
    if (!nameLine) return normalizeName(fallback);
    return normalizeName(nameLine.slice(5).trim().replace(/^["']|["']$/g, "")) || normalizeName(fallback);
}

function copySkill(srcDir, destDir) {
    mkdirSync(destDir, { recursive: true });
    cpSync(join(srcDir, "SKILL.md"), join(destDir, "SKILL.md"));
    const refSrc = join(srcDir, "references");
    if (existsSync(refSrc)) {
        const copyTextTree = (from, to) => {
            for (const entry of readdirSync(from, { withFileTypes: true })) {
                const a = join(from, entry.name);
                const b = join(to, entry.name);
                if (entry.isDirectory()) {
                    mkdirSync(b, { recursive: true });
                    copyTextTree(a, b);
                } else if (TEXT_RE.test(entry.name)) {
                    mkdirSync(dirname(b), { recursive: true });
                    cpSync(a, b);
                }
            }
        };
        mkdirSync(join(destDir, "references"), { recursive: true });
        copyTextTree(refSrc, join(destDir, "references"));
    }
    const tplSrc = join(srcDir, "templates");
    if (existsSync(tplSrc)) {
        const destTpl = join(destDir, "references", "templates");
        mkdirSync(destTpl, { recursive: true });
        const walk = (from, to) => {
            for (const entry of readdirSync(from, { withFileTypes: true })) {
                const a = join(from, entry.name);
                const b = join(to, entry.name);
                if (entry.isDirectory()) {
                    mkdirSync(b, { recursive: true });
                    walk(a, b);
                } else if (TEXT_RE.test(entry.name)) {
                    mkdirSync(dirname(b), { recursive: true });
                    cpSync(a, b);
                }
            }
        };
        walk(tplSrc, destTpl);
    }
}

function extractShanyin() {
    const skillZip = readdirSync(join(vendorDir, "shanyin-screenwriting-master")).find((name) => name.endsWith(".skill"));
    if (!skillZip) return null;
    const zipPath = join(vendorDir, "shanyin-screenwriting-master", skillZip);
    const tmp = join(vendorDir, "_shanyin_extract");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    execSync(`unzip -qo ${JSON.stringify(zipPath)} -d ${JSON.stringify(tmp)}`);
    const skillMd = [...walkFiles(tmp)].find((p) => p.endsWith("/SKILL.md") || p.endsWith("\\SKILL.md") || p.split("/").pop() === "SKILL.md");
    if (!skillMd) return null;
    return dirname(skillMd);
}

function* walkFiles(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) yield* walkFiles(full);
        else yield full;
    }
}

function main() {
    const shouldFetch = process.argv.includes("--fetch");
    if (shouldFetch) ensureVendor();
    if (!existsSync(vendorDir)) {
        console.error("Missing skills/_vendor. Run: bun scripts/sync-bundled-skills.mjs --fetch");
        process.exit(1);
    }

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const sources = [];
    const dirs = findSkillDirs(vendorDir).filter((dir) => !dir.includes("/_shanyin_extract"));
    const shanyin = extractShanyin();
    if (shanyin) dirs.push(shanyin);

    const used = new Set();
    for (const src of dirs) {
        const fallback = src.split(/[/\\]/).filter(Boolean).pop() || "skill";
        let name = parseFrontmatterName(join(src, "SKILL.md"), fallback);
        if (used.has(name)) name = `${name}-${normalizeName(fallback)}`;
        used.add(name);
        const dest = join(outDir, name);
        copySkill(src, dest);
        const sourceRepo = relative(vendorDir, src).split(/[/\\]/)[0] || "unknown";
        sources.push({ name, source: sourceRepo, path: `bundled/${name}` });
        console.log(`bundled ${name} ← ${relative(vendorDir, src)}`);
    }

    // Keep existing template skill in the ship set.
    const localScript = join(root, "skills/script-generation");
    if (existsSync(join(localScript, "SKILL.md"))) {
        const name = parseFrontmatterName(join(localScript, "SKILL.md"), "script-generation");
        if (!used.has(name)) {
            copySkill(localScript, join(outDir, name));
            sources.push({ name, source: "local", path: `bundled/${name}` });
            console.log(`bundled ${name} ← skills/script-generation`);
        }
    }

    writeFileSync(
        join(outDir, "manifest.json"),
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                count: sources.length,
                skills: sources.sort((a, b) => a.name.localeCompare(b.name)),
            },
            null,
            2,
        ),
    );
    writeFileSync(
        join(outDir, "ATTRIBUTION.md"),
        [
            "# Bundled screenwriting skills — attribution",
            "",
            "These packages are vendored for offline use in Minimalist Canvas. Licenses remain with upstream authors.",
            "",
            ...sources.map((item) => `- \`${item.name}\` ← \`${item.source}\``),
            "",
            "Upstream repos:",
            "- https://github.com/eternityspring/shuohao-skills",
            "- https://github.com/zenstory-ai/drama-skills",
            "- https://github.com/jtydhr88/screenwriting-skills",
            "- https://github.com/Shanyin-ai/shanyin-screenwriting-master",
            "- https://github.com/oleo17/story-to-script",
            "- https://github.com/egguy886/write-screenplay-skill",
            "",
        ].join("\n"),
    );

    console.log(`\nDone: ${sources.length} skills → skills/bundled/`);
}

main();
