import { __awaiter } from "tslib";
/**
 * Medium client — browser automation via Playwright for login,
 * then uses Medium's unofficial API with the session token.
 * No API keys needed — just email + password.
 */
import { BasePlatformClient } from './base.client';
export class MediumClient extends BasePlatformClient {
    constructor() { super('medium'); }
    login(email, password) {
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
                // Medium login with email
                yield page.goto('https://medium.com/m/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
                yield page.waitForTimeout(2000);
                // Click "Sign in with email"
                const emailBtn = page.locator('text=Sign in with email').first();
                if (yield emailBtn.isVisible()) {
                    yield emailBtn.click();
                    yield page.waitForTimeout(1000);
                }
                yield page.fill('input[type="email"], input[name="email"]', email);
                const continueBtn = page.locator('button:has-text("Continue")').first();
                if (yield continueBtn.isVisible()) {
                    yield continueBtn.click();
                    yield page.waitForTimeout(1000);
                }
                const passField = page.locator('input[type="password"]');
                if (yield passField.isVisible()) {
                    yield passField.fill(password);
                    yield page.click('button[type="submit"]');
                }
                yield page.waitForFunction(() => !window.location.href.includes('/signin'), { timeout: 30000 });
                yield page.waitForTimeout(2000);
                const cookies = yield ctx.cookies();
                const cookieMap = {};
                for (const c of cookies)
                    cookieMap[c.name] = c.value;
                // Get user info
                const uid = cookieMap['uid'] || '';
                const session = {
                    token: cookieMap['sid'] || '',
                    cookies: cookieMap,
                    extra: { uid, email },
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
    cookieHeader() {
        var _a;
        return Object.entries(((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) || {}).map(([k, v]) => `${k}=${v}`).join('; ');
    }
    req(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, method = 'GET', body) {
            return fetch(`https://medium.com${path}`, Object.assign({ method, headers: {
                    'Cookie': this.cookieHeader(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                } }, (body ? { body: JSON.stringify(body) } : {})));
        });
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Medium draft creation via unofficial API
            try {
                const resp = yield this.req('/_/api/posts', 'POST', {
                    title: text.split('\n')[0].slice(0, 100),
                    content: { bodyModel: { paragraphs: [{ text, type: 1 }], sections: [{ startIndex: 0 }] } },
                    contentFormat: 'markdown',
                    publishedAt: Date.now(),
                    license: 0,
                    notifyFollowers: true,
                });
                if (resp.ok) {
                    const data = yield resp.json();
                    return { success: true, id: (_b = (_a = data === null || data === void 0 ? void 0 : data.payload) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.id };
                }
                return { success: false, error: `${resp.status}` };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            return [];
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const resp = yield this.req(`/_/api/posts/${postId}/responses`, 'POST', {
                    content: { bodyModel: { paragraphs: [{ text, type: 1 }], sections: [{ startIndex: 0 }] } },
                });
                return { success: resp.ok };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const resp = yield this.req(`/_/api/posts/${postId}/votes`, 'POST', { votes: 50 });
                return { success: resp.ok };
            }
            catch (err) {
                return { success: false, error: err.message };
            }
        });
    }
    getMentions() {
        return __awaiter(this, void 0, void 0, function* () { return []; });
    }
    reply(mentionId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.comment(mentionId, text);
        });
    }
}
//# sourceMappingURL=medium.client.js.map