import { __awaiter } from "tslib";
/**
 * Dev.to client — uses the free Dev.to API with a personal access token.
 * Get your token: dev.to → Settings → Extensions → DEV Community API Keys
 * Takes 30 seconds. Paste the token as the "password" when adding the credential.
 * Username can be your handle.
 */
import { BasePlatformClient } from './base.client';
const BASE = 'https://dev.to/api';
export class DevToClient extends BasePlatformClient {
    constructor() {
        super('dev-to');
        this.apiKey = '';
    }
    /** For Dev.to the "password" field IS the API key */
    login(username, apiKey) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify the key works
            const resp = yield fetch(`${BASE}/users/me`, {
                headers: { 'api-key': apiKey },
            });
            if (!resp.ok)
                throw new Error(`Dev.to API key invalid (${resp.status})`);
            const user = yield resp.json();
            this.apiKey = apiKey;
            const session = {
                token: apiKey,
                extra: { username: user.username || username, userId: user.id },
                expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // keys don't expire
            };
            this.session = session;
            return session;
        });
    }
    restoreSession(session) {
        super.restoreSession(session);
        this.apiKey = session.token;
    }
    req(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, method = 'GET', body) {
            return fetch(`${BASE}${path}`, Object.assign({ method, headers: {
                    'api-key': this.apiKey,
                    'Content-Type': 'application/json',
                } }, (body ? { body: JSON.stringify(body) } : {})));
        });
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            const lines = text.split('\n');
            const title = lines[0].replace(/^#+\s*/, '').trim() || 'New Post';
            const body_markdown = lines.slice(1).join('\n').trim() || text;
            const resp = yield this.req('/articles', 'POST', {
                article: {
                    title,
                    body_markdown,
                    published: true,
                    tags: [],
                },
            });
            if (!resp.ok)
                return { success: false, error: `${resp.status}` };
            const data = yield resp.json();
            return { success: true, id: String(data.id), data: { url: data.url } };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            const resp = yield this.req(`/articles?tag=${encodeURIComponent(query)}&per_page=${limit}`);
            if (!resp.ok)
                return [];
            const articles = yield resp.json();
            return articles.map((a) => {
                var _a;
                return ({
                    id: String(a.id),
                    text: a.title,
                    author: ((_a = a.user) === null || _a === void 0 ? void 0 : _a.username) || '',
                    extra: { url: a.url },
                });
            });
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.req('/comments', 'POST', {
                body_markdown: text,
                article_id: parseInt(postId, 10),
            });
            return { success: resp.ok };
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Dev.to doesn't have a like API publicly
            return { success: false, error: 'Dev.to like not available via API' };
        });
    }
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (limit = 20) {
            var _a, _b;
            // Get my recent articles and their comments as "mentions"
            const resp = yield this.req(`/articles?username=${(_b = (_a = this.session) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b.username}&per_page=${limit}`);
            if (!resp.ok)
                return [];
            return [];
        });
    }
    reply(mentionId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.req('/comments', 'POST', {
                body_markdown: text,
                parent_id: parseInt(mentionId, 10),
            });
            return { success: resp.ok };
        });
    }
}
//# sourceMappingURL=devto.client.js.map