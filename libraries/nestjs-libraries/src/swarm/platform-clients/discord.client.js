import { __awaiter } from "tslib";
/**
 * Discord client — uses Discord's web API directly with user token.
 * Login via browser to extract the user token, then use REST API.
 * Note: Automating user accounts violates Discord ToS — use a bot token for production.
 * For username/password access (as requested), browser extraction is used.
 */
import { BasePlatformClient } from './base.client';
export class DiscordClient extends BasePlatformClient {
    constructor() {
        super('discord');
        this.userToken = '';
    }
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
            let extractedToken = '';
            // Intercept network requests to capture the auth token
            page.on('request', (req) => {
                const auth = req.headers()['authorization'];
                if (auth && !auth.startsWith('Bot ') && auth.length > 30) {
                    extractedToken = auth;
                }
            });
            try {
                yield page.goto('https://discord.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
                yield page.waitForSelector('input[name="email"]', { timeout: 15000 });
                yield page.fill('input[name="email"]', email);
                yield page.fill('input[name="password"]', password);
                yield page.click('button[type="submit"]');
                // Wait for main app to load
                yield page.waitForURL('**/channels/**', { timeout: 30000 });
                yield page.waitForTimeout(2000);
                if (!extractedToken) {
                    // Try to extract from localStorage
                    extractedToken = yield page.evaluate(() => {
                        var _a;
                        const iframe = document.createElement('iframe');
                        document.body.appendChild(iframe);
                        const storage = (_a = iframe.contentWindow) === null || _a === void 0 ? void 0 : _a.localStorage;
                        return storage ? JSON.parse(storage.getItem('token') || '""') : '';
                    }).catch(() => '');
                }
                const session = {
                    token: extractedToken,
                    extra: { email },
                    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
                };
                this.session = session;
                this.userToken = extractedToken;
                return session;
            }
            finally {
                yield browser.close();
            }
        });
    }
    restoreSession(session) {
        super.restoreSession(session);
        this.userToken = session.token;
    }
    req(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, method = 'GET', body) {
            return fetch(`https://discord.com/api/v10${path}`, Object.assign({ method, headers: {
                    'Authorization': this.userToken,
                    'Content-Type': 'application/json',
                } }, (body ? { body: JSON.stringify(body) } : {})));
        });
    }
    post(text, channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const targetChannel = channelId || ((_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.defaultChannelId);
            if (!targetChannel)
                return { success: false, error: 'No channel ID specified. Set defaultChannelId in platformConfig.' };
            const resp = yield this.req(`/channels/${targetChannel}/messages`, 'POST', { content: text });
            if (!resp.ok)
                return { success: false, error: `${resp.status}` };
            const data = yield resp.json();
            return { success: true, id: data.id };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            return []; // Discord search requires admin or specific permissions
        });
    }
    comment(postId, text, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const channelId = (extra === null || extra === void 0 ? void 0 : extra.channelId) || ((_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.defaultChannelId);
            if (!channelId)
                return { success: false, error: 'No channel ID' };
            const resp = yield this.req(`/channels/${channelId}/messages`, 'POST', {
                content: text,
                message_reference: { message_id: postId },
            });
            return { success: resp.ok };
        });
    }
    like(postId, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelId = extra === null || extra === void 0 ? void 0 : extra.channelId;
            if (!channelId)
                return { success: false, error: 'No channel ID for reaction' };
            const resp = yield this.req(`/channels/${channelId}/messages/${postId}/reactions/👍/@me`, 'PUT');
            return { success: resp.ok };
        });
    }
    getMentions() {
        return __awaiter(this, void 0, void 0, function* () { return []; });
    }
    reply(mentionId, text, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.comment(mentionId, text, extra);
        });
    }
}
//# sourceMappingURL=discord.client.js.map