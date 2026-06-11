import { __awaiter } from "tslib";
/**
 * Threads client — browser automation via Playwright.
 * Uses threads.net login (Instagram credentials).
 * No API keys needed.
 */
import { BasePlatformClient } from './base.client';
export class ThreadsClient extends BasePlatformClient {
    constructor() { super('threads'); }
    login(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            });
            const page = yield ctx.newPage();
            yield page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            });
            try {
                yield page.goto('https://www.threads.net/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
                yield page.waitForTimeout(3000);
                // Take screenshot for debugging
                yield page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\threads_debug.png', fullPage: true }).catch(() => { });
                // Try multiple selectors for username input
                const usernameSelectors = [
                    'input[aria-label="Phone number, username, or email"]',
                    'input[autocomplete="username"]',
                    'input[name="username"]',
                    'input[type="text"]',
                    'input[placeholder*="Mobile number"]',
                    'input[placeholder*="username"]',
                    'input[placeholder*="email"]',
                ];
                let usernameInput = null;
                for (const sel of usernameSelectors) {
                    try {
                        yield page.waitForSelector(sel, { timeout: 5000 });
                        usernameInput = sel;
                        break;
                    }
                    catch ( /* try next */_a) { /* try next */ }
                }
                if (!usernameInput) {
                    throw new Error('Threads login: could not find username input field');
                }
                yield page.fill(usernameInput, username);
                yield page.waitForTimeout(300);
                // Try multiple selectors for password input
                const passwordSelectors = [
                    'input[type="password"]',
                    'input[name="password"]',
                    'input[autocomplete="current-password"]',
                ];
                let passwordInput = null;
                for (const sel of passwordSelectors) {
                    try {
                        yield page.waitForSelector(sel, { timeout: 5000 });
                        passwordInput = sel;
                        break;
                    }
                    catch ( /* try next */_b) { /* try next */ }
                }
                if (!passwordInput) {
                    throw new Error('Threads login: could not find password input field');
                }
                yield page.fill(passwordInput, password);
                yield page.waitForTimeout(300);
                // Try pressing Enter first, then try button selectors
                let submitBtn = null;
                try {
                    yield page.getByRole('button', { name: 'Log in' }).first().waitFor({ timeout: 5000 });
                    submitBtn = page.getByRole('button', { name: 'Log in' }).first();
                }
                catch ( /* try next */_c) { /* try next */ }
                if (!submitBtn) {
                    const submitSelectors = [
                        'button[type="submit"]',
                        'button:has-text("Log in")',
                        'button:has-text("Log In")',
                    ];
                    for (const sel of submitSelectors) {
                        try {
                            yield page.waitForSelector(sel, { timeout: 5000 });
                            submitBtn = sel;
                            break;
                        }
                        catch ( /* try next */_d) { /* try next */ }
                    }
                }
                if (submitBtn) {
                    if (typeof submitBtn === 'string') {
                        yield page.click(submitBtn);
                    }
                    else {
                        yield submitBtn.click();
                    }
                }
                else {
                    // Fallback: press Enter on password field
                    yield page.press(passwordInput, 'Enter');
                }
                // Wait for redirect away from login page with longer timeout
                try {
                    yield page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 60000 });
                }
                catch (_e) {
                    // Take screenshot to debug
                    yield page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\threads_after_login.png', fullPage: true }).catch(() => { });
                    const currentUrl = page.url();
                    // Handle "Save your login info?" or security screens
                    if (currentUrl.includes('/accounts/onetap') || currentUrl.includes('/challenge') || currentUrl.includes('/security')) {
                        const skipBtn = yield page.$('button:has-text("Not now"), button:has-text("Skip"), [role="button"]:has-text("Not now")').catch(() => null);
                        if (skipBtn) {
                            yield skipBtn.click();
                            yield page.waitForTimeout(2000);
                        }
                        else if (currentUrl.includes('/challenge') || currentUrl.includes('/security')) {
                            throw new Error('Threads login: security challenge detected. Please log in manually via browser to verify your account.');
                        }
                    }
                    // Check if we have session cookies anyway
                    const cookies = yield ctx.cookies();
                    const cookieMap = {};
                    for (const c of cookies)
                        cookieMap[c.name] = c.value;
                    const sessionCookie = cookieMap['sessionid'] || cookieMap['ig_did'];
                    if (!sessionCookie) {
                        throw new Error(`Threads login timed out at ${currentUrl}. Please check credentials and try again.`);
                    }
                    // Navigate to home to confirm we're logged in
                    yield page.goto('https://www.threads.net/', { waitUntil: 'load', timeout: 30000 });
                    yield page.waitForTimeout(2000);
                }
                yield page.waitForTimeout(2000);
                const cookies = yield ctx.cookies();
                const cookieMap = {};
                for (const c of cookies)
                    cookieMap[c.name] = c.value;
                const session = {
                    token: cookieMap['sessionid'] || cookieMap['ig_did'] || '',
                    cookies: cookieMap,
                    extra: { username },
                    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                };
                this.session = session;
                return session;
            }
            finally {
                yield browser.close();
            }
        });
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Threads uses Instagram-backed API
            const token = (_a = this.session) === null || _a === void 0 ? void 0 : _a.token;
            if (!token)
                return { success: false, error: 'Not logged in' };
            try {
                // Use Threads web API
                const resp = yield fetch('https://www.threads.net/api/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Cookie': this.cookieHeader(),
                        'X-IG-App-ID': '238260118697367',
                    },
                    body: new URLSearchParams({
                        doc_id: '7673149799375849',
                        variables: JSON.stringify({ text }),
                    }),
                });
                if (resp.ok)
                    return { success: true };
                return { success: false, error: `${resp.status}` };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            var _a;
            // Use browser to search for threads
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            });
            const page = yield ctx.newPage();
            // Inject cookies
            if ((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) {
                const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
                    name,
                    value,
                    domain: '.threads.net',
                    path: '/',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                }));
                yield ctx.addCookies(cookies);
            }
            try {
                yield page.goto(`https://www.threads.net/search?q=${encodeURIComponent(query)}`, {
                    waitUntil: 'load',
                    timeout: 60000
                });
                yield page.waitForTimeout(3000);
                // Try multiple selectors — Threads frequently changes its DOM
                const selectorStrategies = [
                    '[data-pressable-container="true"] a[href*="/post/"]',
                    '[data-pressable-container="true"] a[href*="/t/"]',
                    'a[href*="/post/"]',
                    'a[href*="/t/"]',
                    'article a[role="link"]',
                ];
                let threads = [];
                const maxResults = limit || 10;
                for (const selector of selectorStrategies) {
                    try {
                        threads = yield page.$$eval(selector, (els, lim) => els.slice(0, lim).map((el, index) => {
                            var _a, _b;
                            const href = el.getAttribute('href') || '';
                            const id = href.split('/').filter(Boolean).pop() || `thread_${index}`;
                            const container = el.closest('[data-pressable-container="true"]');
                            const textContent = ((_b = (_a = container === null || container === void 0 ? void 0 : container.textContent) === null || _a === void 0 ? void 0 : _a.trim()) === null || _b === void 0 ? void 0 : _b.slice(0, 200)) || '';
                            return {
                                id,
                                text: textContent,
                                author: '',
                                extra: { href: href.startsWith('http') ? href : `https://www.threads.net${href}` },
                            };
                        }), maxResults);
                        if (threads.length > 0)
                            break;
                    }
                    catch ( /* try next strategy */_b) { /* try next strategy */ }
                }
                return threads;
            }
            catch (err) {
                return [];
            }
            finally {
                yield browser.close();
            }
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Use browser to comment on a thread
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            });
            const page = yield ctx.newPage();
            // Inject cookies
            if ((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) {
                const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
                    name,
                    value,
                    domain: '.threads.net',
                    path: '/',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                }));
                yield ctx.addCookies(cookies);
            }
            try {
                const postUrl = postId.startsWith('http') ? postId : `https://www.threads.net/t/${postId}`;
                yield page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(3000);
                // Find comment input
                const commentSelectors = [
                    'textarea[placeholder*="Reply"]',
                    'textarea[placeholder*="comment"]',
                    'input[placeholder*="Reply"]',
                    '[contenteditable="true"]',
                ];
                let commentInput = null;
                for (const sel of commentSelectors) {
                    try {
                        yield page.waitForSelector(sel, { timeout: 5000 });
                        commentInput = sel;
                        break;
                    }
                    catch ( /* try next */_b) { /* try next */ }
                }
                if (!commentInput) {
                    return { success: false, error: 'Threads: Could not find comment input field' };
                }
                yield page.fill(commentInput, text);
                yield page.waitForTimeout(500);
                // Submit comment
                const submitBtn = yield page.$('button[type="submit"], button:has-text("Post"), div[role="button"]:has-text("Post")').catch(() => null);
                if (submitBtn) {
                    yield submitBtn.click();
                }
                else {
                    yield page.press(commentInput, 'Enter');
                }
                yield page.waitForTimeout(3000);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close();
            }
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Use browser to like a thread
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            });
            const page = yield ctx.newPage();
            // Inject cookies
            if ((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) {
                const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
                    name,
                    value,
                    domain: '.threads.net',
                    path: '/',
                    secure: true,
                    httpOnly: false,
                    sameSite: 'Lax',
                }));
                yield ctx.addCookies(cookies);
            }
            try {
                const postUrl = postId.startsWith('http') ? postId : `https://www.threads.net/t/${postId}`;
                yield page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(3000);
                // Find like button (heart icon)
                const likeSelectors = [
                    'svg[aria-label="Like"]',
                    'button svg[aria-label="Like"]',
                    '[aria-label="Like"]',
                    'button:has-text("Like")',
                ];
                let likeBtn = null;
                for (const sel of likeSelectors) {
                    try {
                        yield page.waitForSelector(sel, { timeout: 5000 });
                        likeBtn = sel;
                        break;
                    }
                    catch ( /* try next */_b) { /* try next */ }
                }
                if (!likeBtn) {
                    return { success: false, error: 'Threads: Could not find like button' };
                }
                yield page.click(likeBtn);
                yield page.waitForTimeout(2000);
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close();
            }
        });
    }
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (limit = 20) {
            var _a;
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            });
            if ((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) {
                const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
                    name, value, domain: '.threads.net', path: '/', secure: true, httpOnly: false, sameSite: 'Lax',
                }));
                yield ctx.addCookies(cookies);
            }
            const page = yield ctx.newPage();
            try {
                yield page.goto('https://www.threads.net/activity', { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(3000);
                const mentions = yield page.evaluate((lim) => {
                    const items = document.querySelectorAll('[role="listitem"], [data-pressable-container="true"], article');
                    const results = [];
                    items.forEach((item) => {
                        var _a, _b;
                        if (results.length >= lim)
                            return;
                        const text = ((_a = item.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
                        if (text.includes('mentioned') || text.includes('replied') || text.includes('tagged')) {
                            const link = item.querySelector('a[href*="/post/"], a[href*="/t/"]');
                            const href = (link === null || link === void 0 ? void 0 : link.getAttribute('href')) || '';
                            const id = href.split('/').filter(Boolean).pop() || `mention_${results.length}`;
                            const authorLink = item.querySelector('a[href^="/@"]');
                            const author = ((_b = authorLink === null || authorLink === void 0 ? void 0 : authorLink.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                            results.push({ id, text: text.slice(0, 300), author });
                        }
                    });
                    return results;
                }, limit);
                return mentions;
            }
            catch (_b) {
                return [];
            }
            finally {
                yield browser.close();
            }
        });
    }
    repost(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            });
            if ((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) {
                const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
                    name, value, domain: '.threads.net', path: '/', secure: true, httpOnly: false, sameSite: 'Lax',
                }));
                yield ctx.addCookies(cookies);
            }
            const page = yield ctx.newPage();
            try {
                const postUrl = postId.startsWith('http') ? postId : `https://www.threads.net/t/${postId}`;
                yield page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
                yield page.waitForTimeout(3000);
                // Find and click the repost button
                const repostSelectors = [
                    'svg[aria-label="Repost"]',
                    '[aria-label="Repost"]',
                    'div[role="button"] svg[aria-label="Repost"]',
                ];
                let repostBtn = null;
                for (const sel of repostSelectors) {
                    try {
                        yield page.waitForSelector(sel, { timeout: 5000 });
                        repostBtn = sel;
                        break;
                    }
                    catch ( /* try next */_b) { /* try next */ }
                }
                if (!repostBtn) {
                    return { success: false, error: 'Threads: repost button not found' };
                }
                yield page.click(repostBtn);
                yield page.waitForTimeout(1500);
                // Click "Repost" in the popup (not "Quote")
                const confirmBtn = yield page.$('button:has-text("Repost"), div[role="button"]:has-text("Repost"), [role="menuitem"]:has-text("Repost")').catch(() => null);
                if (confirmBtn) {
                    yield confirmBtn.click();
                    yield page.waitForTimeout(2000);
                }
                return { success: true };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
            finally {
                yield browser.close();
            }
        });
    }
    reply(mentionId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.comment(mentionId, text);
        });
    }
    cookieHeader() {
        var _a;
        return Object.entries(((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) || {}).map(([k, v]) => `${k}=${v}`).join('; ');
    }
}
//# sourceMappingURL=threads.client.js.map