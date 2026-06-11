import { __awaiter } from "tslib";
/**
 * Bluesky (AT Protocol) client.
 * Uses username + app-password — no API keys needed.
 * App passwords: bsky.social/settings/app-passwords (takes 10 seconds to create)
 */
import { BasePlatformClient } from './base.client';
const BASE = 'https://bsky.social/xrpc';
export class BlueskyClient extends BasePlatformClient {
    constructor() {
        super('bluesky');
        this.did = '';
        this.accessJwt = '';
        this.refreshJwt = '';
    }
    login(identifier, password) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield fetch(`${BASE}/com.atproto.server.createSession`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password }),
            });
            if (!resp.ok) {
                const err = yield resp.text();
                throw new Error(`Bluesky login failed (${resp.status}): ${err}`);
            }
            const data = (yield resp.json());
            this.did = data.did;
            this.accessJwt = data.accessJwt;
            this.refreshJwt = data.refreshJwt;
            const session = {
                token: data.accessJwt,
                extra: { refreshJwt: data.refreshJwt, did: data.did, handle: data.handle },
                expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2h
            };
            this.session = session;
            return session;
        });
    }
    restoreSession(session) {
        var _a, _b;
        super.restoreSession(session);
        this.accessJwt = session.token;
        this.did = ((_a = session.extra) === null || _a === void 0 ? void 0 : _a.did) || '';
        this.refreshJwt = ((_b = session.extra) === null || _b === void 0 ? void 0 : _b.refreshJwt) || '';
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.req('/com.atproto.repo.createRecord', 'POST', {
                repo: this.did,
                collection: 'app.bsky.feed.post',
                record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() },
            });
            if (!resp.ok)
                return { success: false, error: `${resp.status}` };
            const data = (yield resp.json());
            return { success: true, id: data.uri };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            const resp = yield this.req(`/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (!resp.ok)
                return [];
            const data = (yield resp.json());
            return (data.posts || []).map((p) => {
                var _a, _b;
                return ({
                    id: p.uri,
                    text: ((_a = p.record) === null || _a === void 0 ? void 0 : _a.text) || '',
                    author: ((_b = p.author) === null || _b === void 0 ? void 0 : _b.handle) || '',
                    extra: { cid: p.cid, uri: p.uri },
                });
            });
        });
    }
    comment(postId, text, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            const { uri, cid } = extra || {};
            const resp = yield this.req('/com.atproto.repo.createRecord', 'POST', {
                repo: this.did,
                collection: 'app.bsky.feed.post',
                record: {
                    $type: 'app.bsky.feed.post',
                    text,
                    reply: {
                        root: { uri: uri || postId, cid: cid || '' },
                        parent: { uri: uri || postId, cid: cid || '' },
                    },
                    createdAt: new Date().toISOString(),
                },
            });
            return { success: resp.ok };
        });
    }
    like(postId, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            const { cid } = extra || {};
            const resp = yield this.req('/com.atproto.repo.createRecord', 'POST', {
                repo: this.did,
                collection: 'app.bsky.feed.like',
                record: {
                    $type: 'app.bsky.feed.like',
                    subject: { uri: postId, cid: cid || '' },
                    createdAt: new Date().toISOString(),
                },
            });
            return { success: resp.ok };
        });
    }
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (limit = 20) {
            const resp = yield this.req(`/app.bsky.notification.listNotifications?limit=${limit}`);
            if (!resp.ok)
                return [];
            const data = (yield resp.json());
            return (data.notifications || [])
                .filter((n) => n.reason === 'mention' || n.reason === 'reply')
                .map((n) => {
                var _a, _b, _c, _d, _e;
                return ({
                    id: n.uri,
                    text: ((_a = n.record) === null || _a === void 0 ? void 0 : _a.text) || '',
                    author: ((_b = n.author) === null || _b === void 0 ? void 0 : _b.handle) || '',
                    extra: { cid: n.cid, parentUri: (_e = (_d = (_c = n.record) === null || _c === void 0 ? void 0 : _c.reply) === null || _d === void 0 ? void 0 : _d.parent) === null || _e === void 0 ? void 0 : _e.uri },
                });
            });
        });
    }
    reply(mentionId, text, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.comment(mentionId, text, extra);
        });
    }
    repost(postId, extra) {
        return __awaiter(this, void 0, void 0, function* () {
            const { cid } = extra || {};
            const resp = yield this.req('/com.atproto.repo.createRecord', 'POST', {
                repo: this.did,
                collection: 'app.bsky.feed.repost',
                record: {
                    $type: 'app.bsky.feed.repost',
                    subject: { uri: postId, cid: cid || '' },
                    createdAt: new Date().toISOString(),
                },
            });
            return { success: resp.ok };
        });
    }
    req(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, method = 'GET', body) {
            const url = path.startsWith('http') ? path : `${BASE}${path}`;
            return fetch(url, Object.assign({ method, headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.accessJwt}`,
                } }, (body ? { body: JSON.stringify(body) } : {})));
        });
    }
}
//# sourceMappingURL=bluesky.client.js.map