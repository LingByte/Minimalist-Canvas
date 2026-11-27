import { chromium, type Browser, type BrowserContext, type Frame, type Page } from "playwright";
import { existsSync } from "node:fs";
import { resolveChromePath } from "./chrome.ts";

export type Platform = "douyin" | "kuaishou" | "xiaohongshu";

export type RunnerRequest = {
    command: "login" | "publish" | "sync" | "check";
    platform: Platform;
    accountId: string;
    statePath: string;
    chromePath?: string;
    videoPath?: string;
    title?: string;
    tags?: string[];
    publishAt?: string;
    outPath?: string;
    headless?: boolean;
};

export type ContentMetrics = {
    contentId: string;
    title: string;
    publishedAt?: string;
    playCount?: number;
    completeRate?: number;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
    collectCount?: number;
    homeVisitCount?: number;
    followerDelta?: number;
    avgPlayDurationSec?: number;
    clickCount?: number;
    bounce2sRate?: number;
    raw?: Record<string, unknown>;
};

export function emit(type: "progress" | "done" | "error" | "qr", payload: Record<string, unknown> = {}) {
    process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
}

export function progress(message: string) {
    emit("progress", { message });
}

export function emitQr(qrDataUrl: string) {
    emit("qr", { qrDataUrl, message: "Scan the QR code in the app" });
}

/**
 * Creator sites often refuse to render login QR in true headless mode.
 * For login we open a real Chrome window off-screen, extract the QR into the app,
 * and never require the user to interact with that window.
 */
export async function launchContext(
    req: RunnerRequest,
    options?: { forceFresh?: boolean },
): Promise<{ browser: Browser; context: BrowserContext }> {
    const chromePath = resolveChromePath(req.chromePath);
    const forLogin = req.command === "login";
    // Login must be headed (off-screen). Other jobs stay headless.
    const headless = forLogin ? false : req.headless !== false;
    const useState = !options?.forceFresh && existsSync(req.statePath);

    if (!chromePath && forLogin) {
        throw new Error(
            "No Chrome/Edge found. Install Google Chrome to bind creator accounts, or set CHROME_PATH.",
        );
    }

    progress(
        `${headless ? "Headless" : "Off-screen Chrome"} · ${
            chromePath ? chromePath : "Playwright Chromium"
        }`,
    );

    const args = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-features=Translate,OptimizationHints",
    ];
    if (forLogin) {
        // Keep the automation window off-screen; QR is streamed into the app.
        args.push("--window-position=-2400,-2400", "--window-size=1280,900");
    }

    let browser: Browser;
    try {
        browser = await chromium.launch({
            headless,
            executablePath: chromePath,
            args,
            timeout: 25_000,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to launch browser: ${message}`);
    }

    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "zh-CN",
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        storageState: useState ? req.statePath : undefined,
    });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    return { browser, context };
}

export async function saveState(context: BrowserContext, statePath: string) {
    await context.storageState({ path: statePath });
}

/** Login/QR chrome that appears on creator pages even when URL has no "login". */
async function loginUiVisible(page: Page): Promise<boolean> {
    const texts = [
        "扫码登录",
        "手机扫码",
        "打开抖音扫一扫",
        "打开快手扫一扫",
        "请使用抖音",
        "扫码登录创作者",
        "二维码已失效",
        "刷新二维码",
    ];
    for (const text of texts) {
        if (await page.getByText(text, { exact: false }).first().isVisible().catch(() => false)) {
            return true;
        }
    }
    const selectors = [
        "#animate_qrcode_container",
        "[id*='qrcode']",
        "[class*='qrcode']",
        "[class*='qr-code']",
        "[class*='login-qr']",
        "[aria-label*='二维码']",
    ];
    for (const selector of selectors) {
        const loc = page.locator(selector).first();
        if (await loc.isVisible().catch(() => false)) return true;
    }
    for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        for (const selector of selectors) {
            if (await frame.locator(selector).first().isVisible().catch(() => false)) return true;
        }
    }
    return false;
}

async function hasAuthCookies(page: Page): Promise<boolean> {
    const cookies = await page.context().cookies().catch(() => []);
    return cookies.some((cookie) => {
        if (!cookie.value || cookie.value.length < 8) return false;
        return /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|uid_tt_ss|passport_auth_status|passport_csrf_token|web_session|a1|customer_sess)$/i.test(
            cookie.name,
        );
    });
}

/**
 * Strict login detection. Creator login pages often show "创作中心/首页" in the
 * chrome without "login" in the URL — those must NOT count as success.
 */
async function isLoggedIn(page: Page, successUrlIncludes: string[]) {
    if (await loginUiVisible(page)) return false;

    const url = page.url();
    if (/login|passport|sso|signin/i.test(url)) return false;

    const authCookies = await hasAuthCookies(page);
    if (!authCookies) return false;

    const urlLooksAuthed = successUrlIncludes.some((part) => url.includes(part));

    const strictMarkers = [
        "上传视频",
        "发布视频",
        "内容管理",
        "数据中心",
        "作品管理",
        "笔记管理",
        "数据概览",
        "投稿管理",
        "发布笔记",
    ];
    let markerHit = false;
    for (const marker of strictMarkers) {
        if (await page.getByText(marker, { exact: false }).first().isVisible().catch(() => false)) {
            markerHit = true;
            break;
        }
    }

    return authCookies && (urlLooksAuthed || markerHit);
}

async function extractLoginQrFromScope(scope: Page | Frame): Promise<string | null> {
    // Prefer known QR containers — avoid screenshotting random canvases (that freezes the app).
    const containers = [
        "#animate_qrcode_container",
        "[id*='qrcode']",
        "[class*='qrcode']",
        "[class*='qr-code']",
        "[class*='login-qr']",
        "[aria-label*='二维码']",
    ];
    for (const selector of containers) {
        const loc = scope.locator(selector).first();
        if (!(await loc.isVisible().catch(() => false))) continue;
        const box = await loc.boundingBox().catch(() => null);
        if (!box || box.width < 80 || box.width > 480) continue;
        try {
            const bytes = await loc.screenshot({ type: "png" });
            return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
        } catch {
            // try next
        }
    }

    const imgs = scope.locator(
        "#animate_qrcode_container img, [id*='qrcode'] img, [class*='qrcode'] img, [class*='qr-code'] img, img[src^='data:image']",
    );
    const count = await imgs.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 8); i += 1) {
        const img = imgs.nth(i);
        if (!(await img.isVisible().catch(() => false))) continue;
        const box = await img.boundingBox().catch(() => null);
        if (!box) continue;
        const squareish = Math.abs(box.width - box.height) <= 40;
        const sizeOk = box.width >= 100 && box.width <= 360;
        if (!squareish || !sizeOk) continue;
        const src = (await img.getAttribute("src").catch(() => null)) || "";
        if (src.startsWith("data:image") && src.length > 200) return src;
        try {
            const bytes = await img.screenshot({ type: "png" });
            return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
        } catch {
            // try next
        }
    }
    return null;
}

/** Extract login QR as data URL for in-app display. */
export async function extractLoginQr(page: Page): Promise<string | null> {
    const fromMain = await extractLoginQrFromScope(page);
    if (fromMain) return fromMain;
    for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const qr = await extractLoginQrFromScope(frame).catch(() => null);
        if (qr) return qr;
    }
    return null;
}

/**
 * Off-screen Chrome login: open creator page, push QR to the app,
 * wait until the user scans with their phone.
 */
export async function waitForLogin(
    page: Page,
    opts: {
        loginUrl: string;
        successUrlIncludes: string[];
        timeoutMs?: number;
    },
) {
    progress(`Open login page: ${opts.loginUrl}`);
    await page.goto(opts.loginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);

    try {
        await clickFirst(page, ['button:has-text("登录")', 'a:has-text("登录")', 'text=扫码登录'], 4000);
        await page.waitForTimeout(1500);
    } catch {
        // already on login / QR visible
    }

    if (!(await loginUiVisible(page)) && (await isLoggedIn(page, opts.successUrlIncludes))) {
        progress("Already logged in (valid session cookies)");
        return;
    }

    progress("Waiting for QR…");
    let lastQr = "";
    let lastEmit = 0;
    let sawQr = false;
    const timeout = opts.timeoutMs ?? 5 * 60_000;
    const started = Date.now();
    let lastProgress = 0;

    while (Date.now() - started < timeout) {
        const qr = await extractLoginQr(page);
        const now = Date.now();
        if (qr && (qr !== lastQr || now - lastEmit > 25_000)) {
            lastQr = qr;
            lastEmit = now;
            sawQr = true;
            emitQr(qr);
            progress("QR ready — scan with the mobile app");
        } else if (!sawQr && now - lastProgress > 8_000) {
            lastProgress = now;
            progress("Still looking for QR on the creator login page…");
        }

        if (!(await loginUiVisible(page)) && (await isLoggedIn(page, opts.successUrlIncludes))) {
            if (sawQr || (await hasAuthCookies(page))) {
                progress("Login detected");
                return;
            }
        }

        await page.waitForTimeout(1500);
    }
    throw new Error(
        sawQr
            ? "Login timed out after QR was shown. Scan again and confirm in the app."
            : "Could not extract login QR. Creator page may be blocked — try again.",
    );
}

export function parseLooseNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const raw = value.trim().replace(/,/g, "");
    if (!raw) return undefined;
    const wan = raw.match(/^([\d.]+)\s*万/);
    if (wan) return Math.round(Number(wan[1]) * 10_000);
    const yi = raw.match(/^([\d.]+)\s*亿/);
    if (yi) return Math.round(Number(yi[1]) * 100_000_000);
    const pct = raw.match(/^([\d.]+)\s*%/);
    if (pct) return Number(pct[1]);
    const n = Number(raw.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : undefined;
}

export async function clickFirst(page: Page, selectors: string[], timeout = 12_000) {
    for (const selector of selectors) {
        const loc = page.locator(selector).first();
        try {
            await loc.waitFor({ state: "visible", timeout: Math.min(timeout, 4000) });
            await loc.click({ timeout });
            return selector;
        } catch {
            // try next
        }
    }
    throw new Error(`Could not click any of: ${selectors.join(" | ")}`);
}

export async function fillFirst(page: Page, selectors: string[], value: string, timeout = 12_000) {
    for (const selector of selectors) {
        const loc = page.locator(selector).first();
        try {
            await loc.waitFor({ state: "visible", timeout: Math.min(timeout, 4000) });
            await loc.fill(value, { timeout });
            return selector;
        } catch {
            // try next
        }
    }
    throw new Error(`Could not fill any of: ${selectors.join(" | ")}`);
}
