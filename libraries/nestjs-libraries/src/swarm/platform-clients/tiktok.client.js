import { __awaiter } from "tslib";
/**
 * TikTok client — browser automation via Playwright.
 * Uses email/password login. TikTok has strong anti-bot measures.
 */
import { BasePlatformClient } from './base.client';
export class TikTokClient extends BasePlatformClient {
    constructor() { super('tiktok'); }
    login(email, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const { chromium } = require('playwright');
            const browser = yield chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            });
            const ctx = yield browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                locale: 'en-US',
            });
            const page = yield ctx.newPage();
            yield page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
            });
            try {
                yield page.goto('https://www.tiktok.com/login/phone-or-email/email', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                });
                yield page.waitForTimeout(2000);
                yield page.fill('input[name="username"], input[type="text"]', email);
                yield page.fill('input[type="password"]', password);
                yield page.click('button[type="submit"], button[data-e2e="login-button"]');
                yield page.waitForTimeout(5000);
                const cookies = yield ctx.cookies();
                const cookieMap = {};
                for (const c of cookies)
                    cookieMap[c.name] = c.value;
                const session = {
                    token: cookieMap['sessionid'] || cookieMap['sid_tt'] || '',
                    cookies: cookieMap,
                    extra: { email },
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
            // TikTok video posting requires video upload — text-only not standard
            return { success: false, error: 'TikTok requires video content. Text-only posts not supported.' };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            try {
                const resp = yield fetch(`https://www.tiktok.com/api/search/general/full/?keyword=${encodeURIComponent(query)}&count=${limit}`, {
                    headers: {
                        Cookie: this.cookieHeader(),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
                    },
                });
                if (!resp.ok)
                    return [];
                const data = yield resp.json();
                return (data.data || []).slice(0, limit).map((item) => {
                    var _a, _b, _c, _d, _e;
                    return ({
                        id: ((_b = (_a = item === null || item === void 0 ? void 0 : item.item) === null || _a === void 0 ? void 0 : _a.video) === null || _b === void 0 ? void 0 : _b.id) || '',
                        text: ((_c = item === null || item === void 0 ? void 0 : item.item) === null || _c === void 0 ? void 0 : _c.desc) || '',
                        author: ((_e = (_d = item === null || item === void 0 ? void 0 : item.item) === null || _d === void 0 ? void 0 : _d.author) === null || _e === void 0 ? void 0 : _e.uniqueId) || '',
                    });
                });
            }
            catch (_a) {
                return [];
            }
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: false, error: 'TikTok comment requires app session' };
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: false, error: 'TikTok like requires app session' };
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
    cookieHeader() {
        var _a;
        return Object.entries(((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies) || {}).map(([k, v]) => `${k}=${v}`).join('; ');
    }
}
//# sourceMappingURL=tiktok.client.js.map