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

const LOGIN_URL = "https://creator.xiaohongshu.com/login";
const HOME_URL = "https://creator.xiaohongshu.com/new/home";
const UPLOAD_URL = "https://creator.xiaohongshu.com/publish/publish";
const DATA_URL = "https://creator.xiaohongshu.com/statistics/data-analysis";

export async function xiaohongshuLogin(req: RunnerRequest) {
    const { browser, context } = await launchContext(req, { forceFresh: true });
    try {
        const page = await context.newPage();
        await waitForLogin(page, {
            loginUrl: LOGIN_URL,
            successUrlIncludes: ["creator.xiaohongshu.com/new", "creator.xiaohongshu.com/publish"],
        });
        // Extra navigate to home to ensure cookies settle.
        await page.goto(HOME_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);
        const cookies = await context.cookies();
        const hasSession = cookies.some(
            (c) => /web_session|a1|customer_sess|access-token/i.test(c.name) && c.value.length > 8,
        );
        if (!hasSession) {
            throw new Error("Xiaohongshu login finished without session cookies — QR was not confirmed.");
        }
        await saveState(context, req.statePath);
        progress("Xiaohongshu session saved");
        return { ok: true, statePath: req.statePath };
    } finally {
        await browser.close();
    }
}

export async function xiaohongshuCheck(req: RunnerRequest) {
    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const url = page.url();
        const ok = !url.includes("login") && url.includes("creator.xiaohongshu.com");
        if (ok) await saveState(context, req.statePath);
        return { ok, url };
    } finally {
        await browser.close();
    }
}

export async function xiaohongshuPublish(req: RunnerRequest) {
    if (!req.videoPath) throw new Error("videoPath is required");
    if (!req.title?.trim()) throw new Error("title is required");

    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        progress("Open Xiaohongshu publish page");
        await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
        if (page.url().includes("login")) {
            throw new Error("Xiaohongshu session expired. Re-bind the account.");
        }

        // Switch to video tab when present.
        try {
            await clickFirst(page, ['text=上传视频', 'div:has-text("视频")', 'span:has-text("视频")'], 5000);
        } catch {
            // already on video, or UI changed
        }

        progress("Select video file");
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(req.videoPath);
        progress("Waiting for upload…");
        await page.waitForTimeout(5000);

        progress("Fill title");
        await fillFirst(
            page,
            [
                'input[placeholder*="标题"]',
                'textarea[placeholder*="标题"]',
                "#title",
                'div[contenteditable="true"]',
            ],
            req.title.slice(0, 20),
        );

        const body = [req.title, ...(req.tags || []).map((tag) => `#${tag.replace(/^#/, "")}`)].join("\n");
        try {
            await fillFirst(
                page,
                [
                    'div[contenteditable="true"]',
                    'textarea[placeholder*="正文"]',
                    'textarea[placeholder*="描述"]',
                ],
                body,
            );
        } catch {
            progress("Body editor not found; title only");
        }

        progress("Click publish");
        await clickFirst(page, ['button:has-text("发布")', 'button:has-text("发布笔记")'], 20_000);
        await page.waitForTimeout(5000);
        await saveState(context, req.statePath);
        return { ok: true, remoteUrl: page.url() };
    } finally {
        await browser.close();
    }
}

export async function xiaohongshuSync(req: RunnerRequest) {
    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        progress("Open Xiaohongshu notes data");
        await page.goto(DATA_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        if (page.url().includes("login")) {
            throw new Error("Xiaohongshu session expired. Re-bind the account.");
        }

        try {
            await clickFirst(page, ['text=笔记数据', 'text=内容数据', 'text=作品管理'], 6000);
            await page.waitForTimeout(1500);
        } catch {
            progress("Could not open notes list; scraping visible cards");
        }

        const items = await page.evaluate(() => {
            const rows: Array<Record<string, string>> = [];
            const cards = Array.from(
                document.querySelectorAll("tr, [class*='note'], [class*='content'], [class*='list']"),
            ).slice(0, 80);
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
                contentId: `xhs-${index}-${row.title.slice(0, 24)}`,
                title: row.title,
                playCount: pick(/观看[^\d]*([\d.]+万?|[\d,]+)/) ?? pick(/浏览[^\d]*([\d.]+万?|[\d,]+)/),
                likeCount: pick(/点赞[^\d]*([\d.]+万?|[\d,]+)/),
                commentCount: pick(/评论[^\d]*([\d.]+万?|[\d,]+)/),
                shareCount: pick(/分享[^\d]*([\d.]+万?|[\d,]+)/),
                collectCount: pick(/收藏[^\d]*([\d.]+万?|[\d,]+)/),
                homeVisitCount: pick(/主页访客[^\d]*([\d.]+万?|[\d,]+)/),
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
