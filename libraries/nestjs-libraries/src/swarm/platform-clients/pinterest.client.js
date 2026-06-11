import { __awaiter } from "tslib";
/**
 * Pinterest client — browser automation via Playwright.
 * Logs in with email + password. No API keys needed.
 */
import { BasePlatformClient } from './base.client';
export class PinterestClient extends BasePlatformClient {
    constructor() { super('pinterest'); }
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
                yield page.goto('https://www.pinterest.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                yield page.waitForSelector('input[id="email"]', { timeout: 15000 });
                yield page.fill('input[id="email"]', email);
                yield page.fill('input[id="password"]', password);
                yield page.click('button[type="submit"]');
                yield page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
                yield page.waitForTimeout(2000);
                const cookies = yield ctx.cookies();
                const cookieMap = {};
                for (const c of cookies)
                    cookieMap[c.name] = c.value;
                // Extract CSRFToken
                const csrfToken = cookieMap['csrftoken'] || '';
                const session = {
                    token: cookieMap['_auth'] || '',
                    cookies: cookieMap,
                    extra: { csrfToken, email },
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
            var _a, _b;
            const csrfToken = ((_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.csrfToken) || '';
            return fetch(`https://www.pinterest.com/resource${path}`, Object.assign({ method, headers: {
                    'Cookie': this.cookieHeader(),
                    'X-CSRFToken': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded',
                } }, (body ? { body: new URLSearchParams({ data: JSON.stringify(body) }).toString() } : {})));
        });
    }
    post(text, boardId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Pinterest "Pin" creation requires image URL + board
            return { success: false, error: 'Pinterest requires an image URL. Use the command panel with imageUrl parameter.' };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            var _a, _b;
            try {
                const resp = yield fetch(`https://www.pinterest.com/resource/BaseSearchResource/get/?data=${encodeURIComponent(JSON.stringify({ options: { query, scope: 'pins' }, context: {} }))}`, { headers: { Cookie: this.cookieHeader() } });
                if (!resp.ok)
                    return [];
                const data = yield resp.json();
                const pins = ((_b = (_a = data === null || data === void 0 ? void 0 : data.resource_response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.results) || [];
                return pins.slice(0, limit).map((pin) => {
                    var _a;
                    return ({
                        id: pin.id || '',
                        text: pin.description || pin.title || '',
                        author: ((_a = pin.pinner) === null || _a === void 0 ? void 0 : _a.username) || '',
                    });
                });
            }
            catch (_c) {
                return [];
            }
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.req('/PinCommentResource/create/', 'POST', {
                pin_id: postId,
                text,
            });
            return { success: resp.ok };
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Pinterest has "save" not "like"
            return { success: false, error: 'Pinterest does not have a like action' };
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
//# sourceMappingURL=pinterest.client.js.map