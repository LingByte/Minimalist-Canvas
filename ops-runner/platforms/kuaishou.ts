import { writeFileSync } from "node:fs";
import {
    clickFirst,
    fillFirst,
    launchContext,
    parseLooseNumber,
    progress,
    saveState,
    waitForLogin,
    type ContentMetrics,
    type RunnerRequest,
} from "../shared.ts";

const LOGIN_URL = "https://cp.kuaishou.com/";
const UPLOAD_URL = "https://cp.kuaishou.com/article/publish/video";
const DATA_URL = "https://cp.kuaishou.com/statistics/works";

export async function kuaishouLogin(req: RunnerRequest) {
    const { browser, context } = await launchContext(req, { forceFresh: true });
    try {
        const page = await context.newPage();
        await waitForLogin(page, {
            loginUrl: LOGIN_URL,
            successUrlIncludes: ["cp.kuaishou.com"],
        });
        const cookies = await context.cookies();
        const hasSession = cookies.some(
            (c) => /userId|kuaishou|session|passToken/i.test(c.name) && c.value.length > 6,
        );
        if (!hasSession) {
            throw new Error("Kuaishou login finished without session cookies — QR was not confirmed.");
        }
        await saveState(context, req.statePath);
        progress("Kuaishou session saved");
        return { ok: true, statePath: req.statePath };
    } finally {
        await browser.close();
    }
}

export async function kuaishouCheck(req: RunnerRequest) {
    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const url = page.url();
        const ok = !url.includes("login") && url.includes("cp.kuaishou.com");
        if (ok) await saveState(context, req.statePath);
        return { ok, url };
    } finally {
        await browser.close();
    }
}

export async function kuaishouPublish(req: RunnerRequest) {
    if (!req.videoPath) throw new Error("videoPath is required");
    if (!req.title?.trim()) throw new Error("title is required");

    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        progress("Open Kuaishou upload page");
        await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
        if (page.url().includes("login")) {
            throw new Error("Kuaishou session expired. Re-bind the account.");
        }

        progress("Select video file");
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(req.videoPath);
        progress("Waiting for upload…");
        await page.waitForTimeout(4000);

        progress("Fill description");
        await fillFirst(
            page,
            [
                'textarea[placeholder*="描述"]',
                'textarea[placeholder*="标题"]',
                'div[contenteditable="true"]',
                "textarea",
            ],
            [req.title, ...(req.tags || []).map((tag) => `#${tag.replace(/^#/, "")}`)].join(" "),
        );

        progress("Click publish");
        await clickFirst(page, ['button:has-text("发布")', 'button:has-text("发布作品")'], 20_000);
        await page.waitForTimeout(5000);
        await saveState(context, req.statePath);
        return { ok: true, remoteUrl: page.url() };
    } finally {
        await browser.close();
    }
}

export async function kuaishouSync(req: RunnerRequest) {
    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        progress("Open Kuaishou works stats");
        await page.goto(DATA_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        if (page.url().includes("login")) {
            throw new Error("Kuaishou session expired. Re-bind the account.");
        }

        const items = await page.evaluate(() => {
            const rows: Array<Record<string, string>> = [];
            const cards = Array.from(document.querySelectorAll("tr, [class*='work'], [class*='list']")).slice(
                0,
                80,
            );
            for (const card of cards) {
                const text = (card.textContent || "").replace(/\s+/g, " ").trim();
                if (text.length < 8 || text.length > 500) continue;
                const titleEl = card.querySelector("a, [class*='title'], [class*='name']");
                const title = (titleEl?.textContent || text.slice(0, 40)).trim();
                if (!title) continue;
                rows.push({ title, text });
            }
            const seen = new Set<string>();
            return rows.filter((row) => {
                if (seen.has(row.title)) return false;
                seen.add(row.title);
                return true;
            });
        });

        const metrics: ContentMetrics[] = items.slice(0, 40).map((row, index) => {
            const text = row.text;
            const pick = (re: RegExp) => {
                const m = text.match(re);
                return m ? parseLooseNumber(m[1]) : undefined;
            };
            return {
                contentId: `ks-${index}-${row.title.slice(0, 24)}`,
                title: row.title,
                playCount: pick(/播放[^\d]*([\d.]+万?|[\d,]+)/) ?? pick(/([\d.]+万?)\s*播放/),
                likeCount: pick(/点赞[^\d]*([\d.]+万?|[\d,]+)/) ?? pick(/赞[^\d]*([\d.]+万?|[\d,]+)/),
                commentCount: pick(/评论[^\d]*([\d.]+万?|[\d,]+)/),
                shareCount: pick(/分享[^\d]*([\d.]+万?|[\d,]+)/),
                collectCount: pick(/收藏[^\d]*([\d.]+万?|[\d,]+)/),
                raw: { text },
            };
        });

        progress(`Parsed ${metrics.length} content rows`);
        await saveState(context, req.statePath);
        if (req.outPath) {
            writeFileSync(req.outPath, JSON.stringify({ items: metrics }, null, 2), "utf8");
        }
        return { ok: true, items: metrics };
    } finally {
        await browser.close();
    }
}
