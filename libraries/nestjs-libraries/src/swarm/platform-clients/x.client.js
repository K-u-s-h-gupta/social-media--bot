import { __awaiter } from "tslib";
/**
 * X (Twitter) client — browser login (Playwright) + cookie-based REST API.
 * Supports username/password login. No API keys required.
 */
import { BasePlatformClient } from './base.client';
const BASE = 'https://x.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
export class XClient extends BasePlatformClient {
    constructor() {
        super('x');
    }
    // ─── Login ──────────────────────────────────────────────────────────────────
    login(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, browser } = yield this.openBrowser();
            try {
                yield page.goto('https://x.com/i/flow/login', { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(4000);
                // Handle onboarding redirect — X sometimes sends to /i/jf/onboarding/web
                const currentUrl = page.url();
                if (currentUrl.includes('/onboarding') || currentUrl.includes('/jf/')) {
                    yield page.goto('https://x.com/i/flow/login', { waitUntil: 'load', timeout: 60000 });
                    yield page.waitForTimeout(4000);
                }
                const url = page.url();
                const html = yield page.content();
                console.log(`X login page loaded: ${url}`);
                console.log(`HTML snippet: ${html.slice(0, 500)}`);
                // Enter username
                const usernameInput = yield this.findInput(page, [
                    'input[autocomplete="username"]',
                    'input[name="text"]',
                    'input[name="username_or_email"]',
                    'input[autocomplete="email"]',
                    'input[type="text"]',
                    'input[placeholder*="Username"]',
                    'input[placeholder*="Phone"]',
                    'input[placeholder*="Email"]',
                ]);
                if (!usernameInput) {
                    console.log(`X login page HTML: ${html.slice(0, 1000)}`);
                    throw new Error(`X: username field not found on login page. URL: ${url}`);
                }
                yield usernameInput.focus();
                yield page.waitForTimeout(300);
                yield usernameInput.fill(username);
                yield page.waitForTimeout(300);
                // Click Next
                yield page.waitForTimeout(500);
                const nextBtn = yield page.$('button:has-text("Next"), button[type="submit"], [role="button"]:has-text("Next")');
                console.log(`X next button found: ${!!nextBtn}`);
                if (nextBtn) {
                    yield nextBtn.click();
                    console.log('X next button clicked');
                }
                else {
                    yield usernameInput.press('Enter');
                    console.log('X username Enter pressed');
                }
                yield page.waitForTimeout(500);
                yield page.waitForTimeout(2000);
                // Enter password
                const passwordInput = yield this.findInput(page, [
                    'input[name="password"]',
                    'input[type="password"]',
                    'input[autocomplete="current-password"]',
                    'input[placeholder*="Password"]',
                ]);
                if (!passwordInput)
                    throw new Error('X: password field not found on login page');
                yield passwordInput.focus();
                yield page.waitForTimeout(300);
                yield passwordInput.fill(password);
                yield page.waitForTimeout(300);
                // Click Log in
                yield page.waitForTimeout(500);
                const loginBtn = yield page.$('button:has-text("Log in"), button[type="submit"], [role="button"]:has-text("Log in")');
                console.log(`X login button found: ${!!loginBtn}`);
                if (loginBtn) {
                    yield loginBtn.click();
                    console.log('X login button clicked');
                }
                else {
                    yield passwordInput.press('Enter');
                    console.log('X password Enter pressed');
                }
                yield page.waitForTimeout(500);
                // Wait for navigation away from login
                yield page.waitForTimeout(3000);
                try {
                    yield page.waitForFunction(() => !window.location.href.includes('/login') && !window.location.href.includes('/onboarding'), { timeout: 45000, polling: 1000 });
                }
                catch (_a) {
                    const url = page.url();
                    const screenshotPath = `D:\\Prospektlab-bot\\postiz-app\\x_login_debug.png`;
                    yield page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
                    const html = yield page.content();
                    console.log(`X login timeout at ${url}, html=${html.slice(0, 1000)}`);
                    const errText = yield page.textContent('[data-testid="toast"], .toast, [role="alert"], .error, [data-testid="primaryColumn"]').catch(() => '');
                    if (errText)
                        throw new Error(`X login failed: ${errText}`);
                    throw new Error(`X login timed out at ${url}`);
                }
                yield page.waitForTimeout(2000);
                const finalUrl = page.url();
                console.log(`X final URL after login: ${finalUrl}`);
                // Collect cookies
                const rawCookies = yield page.context().cookies();
                const cookieMap = {};
                for (const c of rawCookies) {
                    if (c.domain.includes('x.com') || c.domain.includes('twitter.com')) {
                        cookieMap[c.name] = c.value;
                    }
                }
                console.log('X cookies after login:', JSON.stringify(cookieMap));
                console.log('X raw cookies:', rawCookies.map((c) => `${c.name}=${c.domain}`).join(', '));
                // Check if we got auth cookies
                const hasAuth = !!cookieMap['auth_token'] || !!cookieMap['ct0'] || !!cookieMap['twid'];
                if (!hasAuth) {
                    // Take a screenshot for debugging
                    const screenshotPath = `D:\\Prospektlab-bot\\postiz-app\\x_login_debug.png`;
                    yield page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
                    console.log(`X login screenshot saved to ${screenshotPath}`);
                    const pageText = yield page.textContent('body').catch(() => '');
                    if (pageText.includes('Sign in') || pageText.includes('Log in') || pageText.includes('Create account')) {
                        throw new Error('X login failed: still on login page after submission');
                    }
                    // If no auth cookies but not on login page, might be logged in via other mechanism
                }
                const token = cookieMap['auth_token'] || cookieMap['ct0'] || cookieMap['twid'] || cookieMap['guest_id'] || '';
                const session = {
                    token,
                    cookies: cookieMap,
                    extra: { ct0: cookieMap['ct0'], username },
                    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                };
                this.session = session;
                return session;
            }
            finally {
                yield browser.close().catch(() => { });
            }
        });
    }
    restoreSession(session) {
        this.session = session;
    }
    // ─── Post ───────────────────────────────────────────────────────────────────
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, browser } = yield this.openBrowser();
            try {
                yield this.injectCookies(page);
                yield page.goto(`${BASE}/compose/post`, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(2000);
                const input = yield page.$('[data-testid="tweetTextarea_0"], div[contenteditable="true"]');
                if (!input) {
                    return { success: false, error: 'Tweet input not found' };
                }
                yield input.click();
                yield page.waitForTimeout(300);
                yield input.fill(text);
                yield page.waitForTimeout(300);
                const postBtn = yield page.$('[data-testid="tweetButton"], button:has-text("Post")');
                if (!postBtn) {
                    return { success: false, error: 'Post button not found' };
                }
                yield postBtn.click();
                yield page.waitForTimeout(3000);
                // Try to get the tweet URL from the page
                const url = page.url();
                return { success: true, id: url, data: { url } };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close().catch(() => { });
            }
        });
    }
    // ─── Search ─────────────────────────────────────────────────────────────────
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, _subreddit) {
            var _a;
            const { page, browser } = yield this.openBrowser();
            try {
                yield this.injectCookies(page);
                const encodedQuery = encodeURIComponent(query);
                yield page.goto(`${BASE}/search?q=${encodedQuery}&f=live`, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(3000);
                const tweets = yield page.$$('[data-testid="tweet"]');
                const results = [];
                for (let i = 0; i < Math.min(tweets.length, limit); i++) {
                    const tweet = tweets[i];
                    const textEl = yield tweet.$('[data-testid="tweetText"]');
                    const text = textEl ? yield textEl.textContent() : '';
                    const linkEl = yield tweet.$('a[href*="/status/"]');
                    const href = linkEl ? yield linkEl.getAttribute('href') : '';
                    const id = ((_a = href.split('/status/')[1]) === null || _a === void 0 ? void 0 : _a.split('?')[0]) || '';
                    const authorEl = yield tweet.$('[data-testid="User-Name"] a');
                    const author = authorEl ? yield authorEl.getAttribute('href') : '';
                    results.push({
                        id,
                        text: text || '',
                        author: author.replace('/', '') || '',
                        extra: { href },
                    });
                }
                return results;
            }
            catch (_b) {
                return [];
            }
            finally {
                yield browser.close().catch(() => { });
            }
        });
    }
    // ─── Comment (reply) ───────────────────────────────────────────────────────
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, browser } = yield this.openBrowser();
            try {
                yield this.injectCookies(page);
                yield page.goto(`${BASE}/i/web/status/${postId}`, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(2000);
                const replyBtn = yield page.$('[data-testid="reply"], button:has-text("Reply")');
                if (!replyBtn) {
                    return { success: false, error: 'Reply button not found' };
                }
                yield replyBtn.click();
                yield page.waitForTimeout(1000);
                const input = yield page.$('[data-testid="tweetTextarea_0"], div[contenteditable="true"]');
                if (!input) {
                    return { success: false, error: 'Reply input not found' };
                }
                yield input.click();
                yield page.waitForTimeout(300);
                yield input.fill(text);
                yield page.waitForTimeout(300);
                const postBtn = yield page.$('[data-testid="tweetButton"], button:has-text("Reply")');
                if (!postBtn) {
                    return { success: false, error: 'Post reply button not found' };
                }
                yield postBtn.click();
                yield page.waitForTimeout(3000);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close().catch(() => { });
            }
        });
    }
    // ─── Like ────────────────────────────────────────────────────────────────────
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, browser } = yield this.openBrowser();
            try {
                yield this.injectCookies(page);
                yield page.goto(`${BASE}/i/web/status/${postId}`, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(2000);
                const likeBtn = yield page.$('[data-testid="like"], button:has-text("Like")');
                if (!likeBtn) {
                    return { success: false, error: 'Like button not found' };
                }
                yield likeBtn.click();
                yield page.waitForTimeout(1000);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close().catch(() => { });
            }
        });
    }
    // ─── Mentions ───────────────────────────────────────────────────────────────
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (limit = 20) {
            var _a, _b;
            const username = ((_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.username) || '';
            if (!username)
                return [];
            const results = yield this.searchPosts(`@${username}`, limit);
            return results.map((r) => ({ id: r.id, text: r.text, author: r.author, extra: r.extra }));
        });
    }
    reply(mentionId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.comment(mentionId, text);
        });
    }
    repost(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { page, browser } = yield this.openBrowser();
            try {
                yield this.injectCookies(page);
                yield page.goto(`${BASE}/i/web/status/${postId}`, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(2000);
                const retweetBtn = yield page.$('[data-testid="retweet"], button:has-text("Retweet")');
                if (!retweetBtn) {
                    return { success: false, error: 'Retweet button not found' };
                }
                yield retweetBtn.click();
                yield page.waitForTimeout(1000);
                const confirmBtn = yield page.$('[data-testid="retweetConfirm"], button:has-text("Retweet")');
                if (confirmBtn) {
                    yield confirmBtn.click();
                }
                yield page.waitForTimeout(1000);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close().catch(() => { });
            }
        });
    }
    // ─── Helpers ────────────────────────────────────────────────────────────────
    findInput(page, selectors) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const sel of selectors) {
                try {
                    const el = yield page.$(sel);
                    if (el)
                        return el;
                }
                catch ( /* try next */_a) { /* try next */ }
            }
            return null;
        });
    }
    injectCookies(page) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies))
                return;
            const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
                name,
                value,
                domain: '.x.com',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'None',
            }));
            yield page.context().addCookies(cookies);
        });
    }
    openBrowser() {
        return __awaiter(this, void 0, void 0, function* () {
            const playwright = require('playwright');
            const browser = yield playwright.chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                ],
            });
            const context = yield browser.newContext({
                userAgent: UA,
                viewport: { width: 1280, height: 900 },
                locale: 'en-US',
                timezoneId: 'America/New_York',
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            yield context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    `);
            const page = yield context.newPage();
            return { page, browser };
        });
    }
}
//# sourceMappingURL=x.client.js.map