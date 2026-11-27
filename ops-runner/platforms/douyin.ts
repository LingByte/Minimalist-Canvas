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

const LOGIN_URL = "https://creator.douyin.com/";
const UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload";
const DATA_URL = "https://creator.douyin.com/creator-micro/data/stats/overview";

export async function douyinLogin(req: RunnerRequest) {
    const { browser, context } = await launchContext(req, { forceFresh: true });
    try {
        const page = await context.newPage();
        await waitForLogin(page, {
            loginUrl: LOGIN_URL,
            successUrlIncludes: ["creator.douyin.com/creator-micro"],
        });
        const cookies = await context.cookies();
        const hasSession = cookies.some(
            (c) => /sessionid|sid_tt|uid_tt/i.test(c.name) && c.value.length > 8,
        );
        if (!hasSession) {
            throw new Error("Douyin login finished without session cookies — QR was not confirmed.");
        }
        await saveState(context, req.statePath);
        progress("Douyin session saved");
        return { ok: true, statePath: req.statePath };
    } finally {
        await browser.close();
    }
}

export async function douyinCheck(req: RunnerRequest) {
    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const url = page.url();
        const ok = !url.includes("login") && url.includes("creator.douyin.com");
        if (ok) await saveState(context, req.statePath);
        return { ok, url };
    } finally {
        await browser.close();
    }
}

export async function douyinPublish(req: RunnerRequest) {
    if (!req.videoPath) throw new Error("videoPath is required");
    if (!req.title?.trim()) throw new Error("title is required");

    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        progress("Open Douyin upload page");
        await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
        if (page.url().includes("login")) {
            throw new Error("Douyin session expired. Re-bind the account.");
        }

        progress("Select video file");
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.setInputFiles(req.videoPath);
        progress("Waiting for upload…");
        await page.waitForTimeout(4000);

        // Title / description editors vary; try common creators UI targets.
        progress("Fill title");
        await fillFirst(
            page,
            [
                '[data-e2e="video_title_input"] textarea',
                '[data-e2e="video_title_input"] input',
                'textarea[placeholder*="标题"]',
                'input[placeholder*="标题"]',
                'div[contenteditable="true"]',
            ],
            req.title.slice(0, 30),
        );

        const tags = (req.tags || []).filter(Boolean).slice(0, 5);
        if (tags.length) {
            progress(`Add tags: ${tags.join(", ")}`);
            const editor = page.locator('div[contenteditable="true"]').first();
            if (await editor.count()) {
                await editor.click();
                for (const tag of tags) {
                    await page.keyboard.type(` #${tag.replace(/^#/, "")}`);
                }
            }
        }

        if (req.publishAt) {
            progress(`Schedule publish: ${req.publishAt}`);
            try {
                await clickFirst(page, ['text=定时发布', 'label:has-text("定时发布")'], 5000);
                // Best-effort; UI clocks differ by version.
            } catch {
                progress("Schedule control not found; publishing immediately");
            }
        }

        progress("Click publish");
        await clickFirst(
            page,
            [
                'button:has-text("发布")',
                '[data-e2e="publish_btn"]',
                'button:has-text("发布作品")',
            ],
            20_000,
        );
        await page.waitForTimeout(5000);
        await saveState(context, req.statePath);
        return { ok: true, remoteUrl: page.url() };
    } finally {
        await browser.close();
    }
}

export async function douyinSync(req: RunnerRequest) {
    const { browser, context } = await launchContext(req);
    try {
        const page = await context.newPage();
        progress("Open Douyin data center");
        await page.goto(DATA_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        if (page.url().includes("login")) {
            throw new Error("Douyin session expired. Re-bind the account.");
        }

        // Prefer content list page if overview is thin.
        try {
            await clickFirst(page, ['text=投稿作品', 'text=作品管理', 'a:has-text("内容管理")'], 6000);
            await page.waitForTimeout(1500);
            await clickFirst(page, ['text=投稿列表', 'text=全部作品'], 6000).catch(() => undefined);
        } catch {
            progress("Could not open content list; scraping visible cards");
        }
        await page.waitForTimeout(2000);

        const items = await page.evaluate(() => {
            const rows: Array<Record<string, string>> = [];
            const cards = Array.from(
                document.querySelectorAll(
                    "[class*='content'], [class*='video'], tr, [class*='list-item'], [class*='work']",
                ),
            ).slice(0, 80);
            for (const card of cards) {
                const text = (card.textContent || "").replace(/\s+/g, " ").trim();
                if (text.length < 8 || text.length > 500) continue;
                const titleEl =
                    card.querySelector("a, [class*='title'], [class*='name']") ||
                    card.querySelector("span, p");
                const title = (titleEl?.textContent || "").trim();
                if (!title || title.length < 2) continue;
                rows.push({ title, text });
            }
            // de-dupe by title
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
                contentId: `dy-${index}-${row.title.slice(0, 24)}`,
                title: row.title,
                playCount: pick(/播放[^\d]*([\d.]+万?|[\d,]+)/) ?? pick(/([\d.]+万?)\s*播放/),
                likeCount: pick(/点赞[^\d]*([\d.]+万?|[\d,]+)/) ?? pick(/([\d.]+万?)\s*赞/),
                commentCount: pick(/评论[^\d]*([\d.]+万?|[\d,]+)/),
                shareCount: pick(/分享[^\d]*([\d.]+万?|[\d,]+)/),
                collectCount: pick(/收藏[^\d]*([\d.]+万?|[\d,]+)/),
                completeRate: pick(/完播[^\d]*([\d.]+%?)/),
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
