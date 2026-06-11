import { __awaiter } from "tslib";
/**
 * Facebook client — browser automation via Playwright.
 * Logs in with email + password (no API keys needed).
 * Note: Facebook has strong anti-bot measures. Use sparingly.
 */
import { BasePlatformClient } from './base.client';
export class FacebookClient extends BasePlatformClient {
    constructor() { super('facebook'); }
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
                yield page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
                yield page.waitForSelector('#email', { timeout: 15000 });
                yield page.fill('#email', email);
                yield page.fill('#pass', password);
                yield page.click('[name="login"]');
                yield page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
                const cookies = yield ctx.cookies();
                const cookieMap = {};
                for (const c of cookies)
                    cookieMap[c.name] = c.value;
                const session = {
                    token: cookieMap['c_user'] || '',
                    cookies: cookieMap,
                    extra: { uid: cookieMap['c_user'] },
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
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            // Facebook Graph-less approach: not trivial without token.
            // For now log the action — full browser post is complex.
            return { success: false, error: 'Facebook posting requires a Page token. Use the browser session for basic browsing.' };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            return [];
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: false, error: 'Facebook comment not implemented' };
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: false, error: 'Facebook like not implemented' };
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
//# sourceMappingURL=facebook.client.js.map