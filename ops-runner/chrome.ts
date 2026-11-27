import { existsSync } from "node:fs";

const CANDIDATES = [
    process.env.LOCAL_CHROME_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
].filter(Boolean) as string[];

/** Prefer system Chrome/Edge — creator centers fingerprint bundled Chromium harshly. */
export function resolveChromePath(override?: string | null) {
    if (override && existsSync(override)) return override;
    for (const candidate of CANDIDATES) {
        if (existsSync(candidate)) return candidate;
    }
    return undefined;
}
