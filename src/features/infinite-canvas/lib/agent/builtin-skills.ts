import { unzipSync, strFromU8 } from "fflate";

import i18n from "@canvas/i18n";
import { isTauri, storageRoot } from "@canvas/services/fs-store";

export type BuiltinSkill = {
    name: string;
    description: string;
    instructions: string;
    path: string;
    /** Extra package files relative to the skill root (references/, scripts/, …). */
    files?: Record<string, string>;
};

export type BuiltinSkillInput = {
    name: string;
    description?: string;
    instructions: string;
    files?: Record<string, string>;
};

export type BuiltinSkillInstallResult = BuiltinSkill & {
    warnings: string[];
};

const BROWSER_SKILLS_KEY = "canvas-builtin-skills-v1";
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Soft limits for skill zip installs. */
export const SKILL_ZIP_LIMITS = {
    maxZipBytes: 20 * 1024 * 1024,
    maxUncompressedBytes: 50 * 1024 * 1024,
    maxFiles: 200,
    maxSingleFileBytes: 5 * 1024 * 1024,
} as const;

const ALLOWED_TOP_DIRS = new Set(["references", "scripts", "assets"]);
const TEXT_EXTS = new Set(["md", "txt", "json", "yaml", "yml", "toml", "csv", "tsv", "js", "ts", "mjs", "cjs", "py", "sh", "html", "css", "svg"]);
const ASSET_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "woff", "woff2", "otf", "ttf", "json", "md", "txt"]);
const SCRIPT_EXTS = new Set(["sh", "py", "js", "ts", "mjs", "cjs"]);
const NESTED_ARCHIVE_EXTS = new Set(["zip", "jar", "war", "apk", "7z", "rar", "gz", "tgz", "bz2", "xz"]);
const BLOCKED_EXTS = new Set(["exe", "dll", "bat", "cmd", "ps1", "com", "scr", "msi", "dmg", "app", "so", "dylib"]);

const TEXT_FILE_RE = /\.(md|txt|json|ya?ml|toml|csv|tsv|js|ts|mjs|cjs|py|sh|html|css|svg)$/i;

const DANGEROUS_PATTERNS: Array<{ re: RegExp; key: string }> = [
    { re: /curl\s+[^\n|;]*\|\s*(?:ba)?sh/i, key: "skillsLibrary.warnPipeShell" },
    { re: /wget\s+[^\n|;]*\|\s*(?:ba)?sh/i, key: "skillsLibrary.warnPipeShell" },
    { re: /invoke-expression/i, key: "skillsLibrary.warnInvokeExpression" },
    { re: /powershell[^\n]*-enc/i, key: "skillsLibrary.warnEncodedPowerShell" },
    { re: /rm\s+-rf\s+\/(?!\w)/i, key: "skillsLibrary.warnDestructiveRm" },
    { re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, key: "skillsLibrary.warnPrivateKey" },
];

let memoryBrowserSkills: BuiltinSkill[] | null = null;

/**
 * Load local skills from {storageRoot}/skills/{name}/SKILL.md.
 * Format mirrors Claude Code skills: YAML-like frontmatter (name, description)
 * followed by markdown instructions. Browser builds fall back to localStorage.
 */
export async function loadBuiltinSkills(): Promise<{ skills: BuiltinSkill[]; error?: string }> {
    if (!isTauri()) return { skills: loadBrowserSkills() };
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
            const skillDir = `${skillsDir}/${entry.name}`;
            const path = `${skillDir}/SKILL.md`;
            if (!(await exists(path))) continue;
            try {
                const parsed = parseSkillFile(await readTextFile(path), entry.name);
                if (!parsed) continue;
                const files = await listSkillPackageFiles(skillDir);
                skills.push({ ...parsed, path, ...(Object.keys(files).length ? { files } : {}) });
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
    const name = normalizeSkillName(meta.name || dirName);
    if (!name || !instructions) return null;
    return { name, description: (meta.description || "").trim(), instructions };
}

export function serializeSkillFile(input: BuiltinSkillInput) {
    const name = normalizeSkillName(input.name);
    const description = (input.description || "").trim();
    const instructions = input.instructions.trim();
    return `---\nname: ${name}\ndescription: ${escapeFrontmatter(description)}\n---\n\n${instructions}\n`;
}

export function normalizeSkillName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

export function isValidSkillName(name: string) {
    return SKILL_NAME_PATTERN.test(name);
}

export function isZipMagic(bytes: Uint8Array) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
}

export async function installBuiltinSkill(input: BuiltinSkillInput): Promise<BuiltinSkill> {
    const name = normalizeSkillName(input.name);
    if (!isValidSkillName(name)) throw new Error(i18n.t("skillsLibrary.invalidName"));
    const instructions = input.instructions.trim();
    if (!instructions) throw new Error(i18n.t("skillsLibrary.instructionsRequired"));
    const description = (input.description || "").trim();
    const content = serializeSkillFile({ name, description, instructions });
    const files = sanitizeSkillFiles(input.files);

    if (!isTauri()) {
        const skills = loadBrowserSkills().filter((skill) => skill.name !== name);
        const next: BuiltinSkill = {
            name,
            description,
            instructions,
            path: `browser://${name}`,
            ...(Object.keys(files).length ? { files } : {}),
        };
        saveBrowserSkills([...skills, next].sort((a, b) => a.name.localeCompare(b.name)));
        return next;
    }

    const { mkdir, writeTextFile, writeFile, exists, remove } = await import("@tauri-apps/plugin-fs");
    const root = await storageRoot();
    if (!root) throw new Error(i18n.t("skillsLibrary.storageUnavailable"));
    const skillsDir = `${root.replace(/[/\\]+$/, "")}/skills`;
    const skillDir = `${skillsDir}/${name}`;
    if (!(await exists(skillsDir))) await mkdir(skillsDir, { recursive: true });
    if (await exists(skillDir)) await remove(skillDir, { recursive: true });
    await mkdir(skillDir, { recursive: true });
    const path = `${skillDir}/SKILL.md`;
    await writeTextFile(path, content);
    for (const [relative, body] of Object.entries(files)) {
        const target = joinUnderSkillDir(skillDir, relative);
        const parent = target.replace(/[/\\][^/\\]+$/, "");
        if (parent && !(await exists(parent))) await mkdir(parent, { recursive: true });
        if (TEXT_FILE_RE.test(relative)) await writeTextFile(target, body);
        else {
            const binary = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
            await writeFile(target, binary);
        }
    }
    return { name, description, instructions, path, ...(Object.keys(files).length ? { files } : {}) };
}

export async function installBuiltinSkillFromMarkdown(raw: string, fallbackName = "imported-skill") {
    const parsed = parseSkillFile(raw, fallbackName);
    if (!parsed) throw new Error(i18n.t("agent.state.skillParseFailed"));
    return installBuiltinSkill(parsed);
}

/**
 * Install a standard Agent Skills zip with hardening:
 * magic bytes, size limits, no encrypted/nested archives, path allowlist.
 * Scripts may be stored under scripts/ but are never executed by the app.
 */
export async function installBuiltinSkillFromZip(bytes: Uint8Array, fallbackName = "imported-skill"): Promise<BuiltinSkillInstallResult> {
    assertZipContainerSafe(bytes);

    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch {
        throw new Error(i18n.t("skillsLibrary.invalidZip"));
    }

    const files = Object.entries(entries)
        .filter(([path, data]) => Boolean(data) && !path.endsWith("/"))
        .map(([path, data]) => ({ path: normalizeZipEntryPath(path), data }));

    const usable = files.filter((file) => file.path && !isIgnoredZipPath(file.path));
    if (!usable.length) throw new Error(i18n.t("skillsLibrary.emptyZipArchive"));
    if (usable.length > SKILL_ZIP_LIMITS.maxFiles) {
        throw new Error(i18n.t("skillsLibrary.tooManyFiles", { count: SKILL_ZIP_LIMITS.maxFiles }));
    }

    let uncompressed = 0;
    for (const file of usable) {
        uncompressed += file.data.byteLength;
        if (file.data.byteLength > SKILL_ZIP_LIMITS.maxSingleFileBytes) {
            throw new Error(i18n.t("skillsLibrary.fileTooLarge", { name: file.path }));
        }
        if (uncompressed > SKILL_ZIP_LIMITS.maxUncompressedBytes) {
            throw new Error(i18n.t("skillsLibrary.uncompressedTooLarge"));
        }
        assertNoNestedArchive(file.path);
    }

    const skillMd = usable.find((file) => /(^|\/)SKILL\.md$/i.test(file.path));
    if (!skillMd) throw new Error(i18n.t("skillsLibrary.missingSkillMd"));

    const rootPrefix = skillMd.path.includes("/") ? skillMd.path.slice(0, skillMd.path.lastIndexOf("/") + 1) : "";
    const folderName = rootPrefix ? rootPrefix.replace(/\/$/, "").split("/").pop() || fallbackName : fallbackName;
    let raw: string;
    try {
        raw = strFromU8(skillMd.data);
    } catch {
        throw new Error(i18n.t("skillsLibrary.invalidTextFile", { name: "SKILL.md" }));
    }
    const parsed = parseSkillFile(raw, folderName);
    if (!parsed) throw new Error(i18n.t("agent.state.skillParseFailed"));

    const packageFiles: Record<string, string> = {};
    const warnings = new Set<string>(scanDangerousContent(raw).map((key) => i18n.t(key)));
    const skippedPaths: string[] = [];

    for (const file of usable) {
        if (!file.path.startsWith(rootPrefix)) continue;
        const relative = file.path.slice(rootPrefix.length);
        if (!relative || /^SKILL\.md$/i.test(relative)) continue;
        // Root docs like README/LICENSE are common; skip quietly. Dangerous types still hard-fail.
        if (isHarmlessSkippedPath(relative)) continue;
        if (!isAllowedSkillRelativePath(relative)) {
            const ext = extensionOf(relative);
            if (ext && (BLOCKED_EXTS.has(ext) || NESTED_ARCHIVE_EXTS.has(ext))) {
                throw new Error(i18n.t("skillsLibrary.disallowedPath", { path: relative }));
            }
            skippedPaths.push(relative);
            continue;
        }
        if (TEXT_FILE_RE.test(relative)) {
            let text: string;
            try {
                text = strFromU8(file.data);
            } catch {
                throw new Error(i18n.t("skillsLibrary.invalidTextFile", { name: relative }));
            }
            for (const key of scanDangerousContent(text)) warnings.add(i18n.t(key));
            packageFiles[relative] = text;
        } else {
            packageFiles[relative] = bytesToBase64(file.data);
        }
    }
    for (const path of skippedPaths.slice(0, 3)) {
        warnings.add(i18n.t("skillsLibrary.warnSkippedFile", { path }));
    }
    if (skippedPaths.length > 3) {
        warnings.add(i18n.t("skillsLibrary.warnSkippedCount", { count: skippedPaths.length - 3 }));
    }

    if ([...Object.keys(packageFiles)].some((path) => path.toLowerCase().startsWith("scripts/"))) {
        warnings.add(i18n.t("skillsLibrary.warnScriptsStored"));
    }

    const skill = await installBuiltinSkill({ ...parsed, files: packageFiles });
    return { ...skill, warnings: [...warnings] };
}

export async function uninstallBuiltinSkill(name: string) {
    const skillName = normalizeSkillName(name);
    if (!skillName) return;
    if (!isTauri()) {
        saveBrowserSkills(loadBrowserSkills().filter((skill) => skill.name !== skillName));
        return;
    }
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const root = await storageRoot();
    if (!root) return;
    const skillDir = `${root.replace(/[/\\]+$/, "")}/skills/${skillName}`;
    if (await exists(skillDir)) await remove(skillDir, { recursive: true });
}

function assertZipContainerSafe(bytes: Uint8Array) {
    if (bytes.byteLength > SKILL_ZIP_LIMITS.maxZipBytes) {
        throw new Error(i18n.t("skillsLibrary.zipTooLarge", { mb: Math.floor(SKILL_ZIP_LIMITS.maxZipBytes / (1024 * 1024)) }));
    }
    if (!isZipMagic(bytes)) throw new Error(i18n.t("skillsLibrary.invalidZipMagic"));
    if (zipHasEncryptedEntries(bytes)) throw new Error(i18n.t("skillsLibrary.encryptedZip"));
}

function zipHasEncryptedEntries(bytes: Uint8Array) {
    // Walk local file headers from the start (normal zips begin with PK\x03\x04).
    let offset = 0;
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) return false;
    while (offset + 30 <= bytes.length) {
        if (!(bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04)) break;
        const flags = bytes[offset + 6] | (bytes[offset + 7] << 8);
        if (flags & 0x1) return true;
        const compSize = readU32(bytes, offset + 18);
        const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
        const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
        offset += 30 + nameLen + extraLen;
        if (flags & 0x8) {
            const next = findNextZipSignature(bytes, offset);
            offset = next < 0 ? bytes.length : next;
            continue;
        }
        offset += compSize;
    }
    return false;
}

function readU32(bytes: Uint8Array, offset: number) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function findNextZipSignature(bytes: Uint8Array, from: number) {
    for (let index = from; index + 3 < bytes.length; index += 1) {
        if (bytes[index] !== 0x50 || bytes[index + 1] !== 0x4b) continue;
        const b2 = bytes[index + 2];
        const b3 = bytes[index + 3];
        if ((b2 === 0x03 && b3 === 0x04) || (b2 === 0x01 && b3 === 0x02) || (b2 === 0x05 && b3 === 0x06)) return index;
    }
    return -1;
}

function normalizeZipEntryPath(path: string) {
    return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function isIgnoredZipPath(path: string) {
    return path.split("/").some((part) => !part || part === "__MACOSX" || part.startsWith(".") || part === "Thumbs.db");
}

function assertNoNestedArchive(path: string) {
    const ext = extensionOf(path);
    if (ext && NESTED_ARCHIVE_EXTS.has(ext)) {
        throw new Error(i18n.t("skillsLibrary.nestedArchive", { path }));
    }
}

export function isAllowedSkillRelativePath(relative: string) {
    const path = normalizeZipEntryPath(relative);
    if (!isSafeRelativePath(path)) return false;
    if (/^SKILL\.md$/i.test(path)) return true;

    const parts = path.split("/");
    const top = parts[0]?.toLowerCase();
    if (!ALLOWED_TOP_DIRS.has(top) || parts.length < 2) return false;

    const ext = extensionOf(path);
    if (!ext || BLOCKED_EXTS.has(ext) || NESTED_ARCHIVE_EXTS.has(ext)) return false;
    if (top === "assets") return ASSET_EXTS.has(ext);
    if (top === "scripts") return SCRIPT_EXTS.has(ext) || TEXT_EXTS.has(ext);
    return TEXT_EXTS.has(ext);
}

function isHarmlessSkippedPath(relative: string) {
    const path = normalizeZipEntryPath(relative);
    if (!isSafeRelativePath(path)) return false;
    if (path.includes("/")) return false;
    return /^(readme|license|licence|changelog|notice|authors|contributing)(\.(md|txt|rst))?$/i.test(path);
}

function isSafeRelativePath(path: string) {
    if (!path || path.includes("\0") || path.startsWith("/") || path.includes("\\")) return false;
    if (/^[a-zA-Z]:/.test(path)) return false;
    const parts = path.split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith(".") || part === "__MACOSX")) return false;
    return true;
}

function extensionOf(path: string) {
    const base = path.split("/").pop() || "";
    const index = base.lastIndexOf(".");
    if (index <= 0) return "";
    return base.slice(index + 1).toLowerCase();
}

function scanDangerousContent(text: string) {
    const hits: string[] = [];
    for (const item of DANGEROUS_PATTERNS) {
        if (item.re.test(text)) hits.push(item.key);
    }
    return hits;
}

function joinUnderSkillDir(skillDir: string, relative: string) {
    const safe = normalizeZipEntryPath(relative);
    if (!isAllowedSkillRelativePath(safe)) throw new Error(i18n.t("skillsLibrary.disallowedPath", { path: relative }));
    return `${skillDir}/${safe}`;
}

function loadBrowserSkills(): BuiltinSkill[] {
    try {
        if (typeof localStorage === "undefined") return memoryBrowserSkills || [];
        const raw = localStorage.getItem(BROWSER_SKILLS_KEY);
        if (!raw) return memoryBrowserSkills || [];
        const parsed = JSON.parse(raw) as BuiltinSkill[];
        return Array.isArray(parsed) ? parsed.filter((item) => item?.name && item?.instructions) : [];
    } catch {
        return memoryBrowserSkills || [];
    }
}

function saveBrowserSkills(skills: BuiltinSkill[]) {
    memoryBrowserSkills = skills;
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(BROWSER_SKILLS_KEY, JSON.stringify(skills));
    } catch {
        throw new Error(i18n.t("skillsLibrary.storageQuota"));
    }
}

/** List package files under a skill dir (text inline; binaries as base64). */
async function listSkillPackageFiles(skillDir: string) {
    const { readDir, readTextFile, readFile, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(skillDir))) return {} as Record<string, string>;
    const files: Record<string, string> = {};

    const walk = async (dir: string, prefix: string) => {
        const entries = await readDir(dir);
        for (const entry of entries) {
            const name = entry.name;
            if (!name || name.startsWith(".") || name === "__MACOSX") continue;
            const relative = prefix ? `${prefix}/${name}` : name;
            if (/^SKILL\.md$/i.test(relative)) continue;
            const full = `${dir}/${name}`;
            if (entry.isDirectory) {
                await walk(full, relative);
                continue;
            }
            if (!isAllowedSkillRelativePath(relative)) continue;
            if (TEXT_FILE_RE.test(relative)) {
                try {
                    files[relative] = await readTextFile(full);
                } catch {
                    files[relative] = "";
                }
            } else {
                try {
                    files[relative] = bytesToBase64(new Uint8Array(await readFile(full)));
                } catch {
                    files[relative] = "";
                }
            }
        }
    };

    await walk(skillDir, "");
    return files;
}

function sanitizeSkillFiles(files?: Record<string, string>) {
    const next: Record<string, string> = {};
    if (!files) return next;
    for (const [key, value] of Object.entries(files)) {
        const relative = normalizeZipEntryPath(key);
        if (!isAllowedSkillRelativePath(relative)) continue;
        if (typeof value !== "string") continue;
        next[relative] = value;
    }
    return next;
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
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

function escapeFrontmatter(value: string) {
    if (!value) return '""';
    if (/[:#"'\n]/.test(value)) return JSON.stringify(value);
    return value;
}
