import { __awaiter } from "tslib";
/**
 * Reddit client — browser login (Playwright) + cookie-based REST API.
 * Supports username/password login. No app registration needed.
 */
import { BasePlatformClient } from './base.client';
const BASE = 'https://www.reddit.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
export class RedditClient extends BasePlatformClient {
    constructor() {
        super('reddit');
    }
    // ─── Login ──────────────────────────────────────────────────────────────────
    login(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const { page, browser } = yield this.openBrowser();
            try {
                // Use 'load' — Reddit SPA never reaches 'networkidle'
                yield page.goto(`${BASE}/login/`, {
                    waitUntil: 'load',
                    timeout: 60000,
                });
                // Wait a couple seconds for the SPA to hydrate
                yield page.waitForTimeout(2500);
                // Try multiple selector patterns Reddit uses
                const usernameInput = yield this.findInput(page, [
                    'input[name="username"]',
                    'input[id="login-username"]',
                    'input[id="loginUsername"]',
                    'faceplate-text-input[name="username"] input',
                    'auth-flow-modal input[name="username"]',
                    'input[autocomplete="username"]',
                ]);
                if (!usernameInput)
                    throw new Error('Reddit: username field not found on login page');
                const passwordInput = yield this.findInput(page, [
                    'input[name="password"]',
                    'input[id="login-password"]',
                    'input[id="loginPassword"]',
                    'faceplate-text-input[name="password"] input',
                    'auth-flow-modal input[name="password"]',
                    'input[type="password"]',
                ]);
                if (!passwordInput)
                    throw new Error('Reddit: password field not found on login page');
                // Fill credentials
                yield usernameInput.click();
                yield page.waitForTimeout(300);
                yield usernameInput.fill(username);
                yield page.waitForTimeout(300);
                yield passwordInput.click();
                yield page.waitForTimeout(300);
                yield passwordInput.fill(password);
                yield page.waitForTimeout(500);
                // Submit
                const submitBtn = yield this.findInput(page, [
                    'button[type="submit"]',
                    'auth-flow-modal button[type="submit"]',
                    'button:text("Log In")',
                    'button:text("Log in")',
                    'button:text("Continue")',
                ]);
                if (submitBtn) {
                    yield submitBtn.click();
                }
                else {
                    yield passwordInput.press('Enter');
                }
                // Wait for successful navigation away from /login
                yield page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 45000, polling: 1000 }).catch(() => __awaiter(this, void 0, void 0, function* () {
                    // Check for error messages
                    const errText = yield page.textContent('[id*="error"], .error-message, [class*="error"]').catch(() => '');
                    throw new Error(`Reddit login failed: ${errText || 'timed out — check credentials'}`);
                }));
                yield page.waitForTimeout(2000);
                // Extract modhash for CSRF
                const meData = yield page.evaluate(() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const r = yield fetch('/api/me.json', { credentials: 'include' });
                        return r.json();
                    }
                    catch (_a) {
                        return {};
                    }
                })).catch(() => ({}));
                const modhash = ((_a = meData === null || meData === void 0 ? void 0 : meData.data) === null || _a === void 0 ? void 0 : _a.modhash) || '';
                const loggedInUser = ((_b = meData === null || meData === void 0 ? void 0 : meData.data) === null || _b === void 0 ? void 0 : _b.name) || username;
                // Collect all reddit.com cookies
                const rawCookies = yield page.context().cookies();
                const cookieMap = {};
                for (const c of rawCookies) {
                    if (c.domain.includes('reddit.com'))
                        cookieMap[c.name] = c.value;
                }
                // Accept any of these auth tokens
                const token = cookieMap['reddit_session'] ||
                    cookieMap['token_v2'] ||
                    cookieMap['session'] ||
                    modhash;
                if (!token) {
                    throw new Error('Reddit: login appeared to succeed but no auth token found — verify your username/password');
                }
                const session = {
                    token,
                    cookies: cookieMap,
                    extra: { modhash, username: loggedInUser },
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
            var _a, _b, _c, _d, _e, _f, _g, _h;
            // Try to extract subreddit hint from text (e.g. "r/stocks: ...")
            const subredditMatch = text.match(/\br\/([A-Za-z0-9_]+)\b/);
            const subreddit = subredditMatch
                ? subredditMatch[1]
                : `u_${((_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.username) || 'test'}`; // personal profile subreddit as fallback
            // Clean text: remove "r/xxx:" prefix if present
            const cleanText = text.replace(/^r\/\w+:\s*/, '').trim() || text;
            // Title = first sentence / first 300 chars
            const title = cleanText.split(/[.!\n]/)[0].slice(0, 300) || cleanText.slice(0, 300);
            const body = cleanText.length > 300 ? cleanText : '';
            const resp = yield this.req('/api/submit', 'POST', {
                sr: subreddit,
                kind: 'self',
                title,
                text: body,
                resubmit: 'true',
                nsfw: 'false',
                api_type: 'json',
            });
            if (!resp.ok) {
                const errorText = yield resp.text().catch(() => '');
                return { success: false, error: `HTTP ${resp.status}: ${errorText.slice(0, 200)}` };
            }
            const data = yield resp.json();
            if ((_d = (_c = data === null || data === void 0 ? void 0 : data.json) === null || _c === void 0 ? void 0 : _c.errors) === null || _d === void 0 ? void 0 : _d.length) {
                return { success: false, error: data.json.errors.map((e) => e[1]).join(', ') };
            }
            const id = (_f = (_e = data === null || data === void 0 ? void 0 : data.json) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.id;
            return { success: !!id, id, data: { url: (_h = (_g = data === null || data === void 0 ? void 0 : data.json) === null || _g === void 0 ? void 0 : _g.data) === null || _h === void 0 ? void 0 : _h.url } };
        });
    }
    // ─── Search ─────────────────────────────────────────────────────────────────
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            var _a;
            const url = subreddit
                ? `/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 25)}&sort=new&type=link,self&restrict_sr=on`
                : `/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 25)}&sort=new&type=link,self`;
            const resp = yield this.req(url);
            if (!resp.ok)
                return [];
            const data = yield resp.json();
            return (((_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.children) || []).slice(0, limit).map((c) => ({
                id: c.data.name,
                text: `${c.data.title} ${c.data.selftext || ''}`.trim().slice(0, 500),
                author: c.data.author,
                authorId: c.data.author,
                extra: {
                    subreddit: c.data.subreddit,
                    permalink: c.data.permalink,
                    name: c.data.name,
                    score: c.data.score,
                },
            }));
        });
    }
    // ─── Comment ────────────────────────────────────────────────────────────────
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            // postId should be "t3_xxxxx" format (link post) or "t1_xxxxx" (comment)
            const thingId = postId.includes('_') ? postId : `t3_${postId}`;
            const resp = yield this.req('/api/comment', 'POST', {
                thing_id: thingId,
                text,
                api_type: 'json',
            });
            if (!resp.ok)
                return { success: false, error: `HTTP ${resp.status}` };
            const data = yield resp.json();
            if ((_b = (_a = data === null || data === void 0 ? void 0 : data.json) === null || _a === void 0 ? void 0 : _a.errors) === null || _b === void 0 ? void 0 : _b.length) {
                return { success: false, error: data.json.errors.map((e) => e[1]).join(', ') };
            }
            return { success: true, id: (_g = (_f = (_e = (_d = (_c = data === null || data === void 0 ? void 0 : data.json) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.things) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.id };
        });
    }
    // ─── Like (upvote) ──────────────────────────────────────────────────────────
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            const thingId = postId.includes('_') ? postId : `t3_${postId}`;
            const resp = yield this.req('/api/vote', 'POST', { id: thingId, dir: '1' });
            return { success: resp.ok, error: resp.ok ? undefined : `HTTP ${resp.status}` };
        });
    }
    // ─── Mentions ───────────────────────────────────────────────────────────────
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (limit = 25) {
            var _a;
            const resp = yield this.req(`/message/mentions.json?limit=${Math.min(limit, 25)}&mark=false`);
            if (!resp.ok)
                return [];
            const data = yield resp.json();
            return (((_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.children) || []).map((c) => ({
                id: c.data.name,
                text: c.data.body || c.data.subject || '',
                author: c.data.author,
                extra: { context: c.data.context, subreddit: c.data.subreddit },
            }));
        });
    }
    reply(mentionId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.comment(mentionId, text);
        });
    }
    // ─── Repost (crosspost) ────────────────────────────────────────────────────
    repost(postId, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const thingId = postId.includes('_') ? postId : `t3_${postId}`;
            const targetSub = (extra === null || extra === void 0 ? void 0 : extra.subreddit) || `u_${((_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.username) || 'me'}`;
            const resp = yield this.req('/api/crosspost', 'POST', {
                thing_id: thingId,
                sr: targetSub,
                kind: 'crosspost',
                api_type: 'json',
                resubmit: 'true',
                title: (extra === null || extra === void 0 ? void 0 : extra.title) || 'Crosspost',
            });
            if (!resp.ok) {
                const text = yield resp.text().catch(() => '');
                return { success: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
            }
            const data = yield resp.json();
            if ((_d = (_c = data === null || data === void 0 ? void 0 : data.json) === null || _c === void 0 ? void 0 : _c.errors) === null || _d === void 0 ? void 0 : _d.length) {
                return { success: false, error: data.json.errors.map((e) => e[1]).join(', ') };
            }
            return { success: true, id: (_f = (_e = data === null || data === void 0 ? void 0 : data.json) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.id };
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
    req(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, method = 'GET', body) {
            var _a, _b, _c;
            if (!((_a = this.session) === null || _a === void 0 ? void 0 : _a.cookies)) {
                throw new Error('Reddit: not logged in — session missing');
            }
            const cookieStr = Object.entries(this.session.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join('; ');
            const headers = {
                Cookie: cookieStr,
                'User-Agent': UA,
                Accept: 'application/json',
            };
            if (method === 'POST') {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                headers['X-Modhash'] = ((_c = (_b = this.session) === null || _b === void 0 ? void 0 : _b.extra) === null || _c === void 0 ? void 0 : _c.modhash) || '';
            }
            const init = { method, headers };
            if (body && method === 'POST')
                init.body = new URLSearchParams(body).toString();
            return fetch(`${BASE}${path}`, init);
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
//# sourceMappingURL=reddit.client.js.map