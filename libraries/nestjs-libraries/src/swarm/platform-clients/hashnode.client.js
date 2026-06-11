import { __awaiter } from "tslib";
/**
 * Hashnode client — uses Hashnode's GraphQL API with a personal access token.
 * Get your token: hashnode.com → Account Settings → Developer → Personal Access Tokens
 * Paste the token as the "password" when adding the credential.
 * Username = your Hashnode username (or blog publication host).
 */
import { BasePlatformClient } from './base.client';
const GQL = 'https://gql.hashnode.com';
export class HashnodeClient extends BasePlatformClient {
    constructor() {
        super('hashnode');
        this.token = '';
        this.publicationId = '';
    }
    login(username, apiToken) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            this.token = apiToken;
            // Verify token + get user/publication info
            const resp = yield this.gql(`
      query Me {
        me {
          id
          username
          publications(first: 1) {
            edges { node { id title } }
          }
        }
      }
    `);
            if (!resp.ok)
                throw new Error(`Hashnode token invalid (${resp.status})`);
            const data = yield resp.json();
            const user = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.me;
            if (!user)
                throw new Error('Hashnode: could not fetch user info');
            this.publicationId = ((_e = (_d = (_c = (_b = user.publications) === null || _b === void 0 ? void 0 : _b.edges) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.node) === null || _e === void 0 ? void 0 : _e.id) || '';
            const session = {
                token: apiToken,
                extra: { username: user.username, userId: user.id, publicationId: this.publicationId },
                expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
            };
            this.session = session;
            return session;
        });
    }
    restoreSession(session) {
        var _a;
        super.restoreSession(session);
        this.token = session.token;
        this.publicationId = ((_a = session.extra) === null || _a === void 0 ? void 0 : _a.publicationId) || '';
    }
    gql(query, variables) {
        return fetch(GQL, {
            method: 'POST',
            headers: {
                'Authorization': this.token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });
    }
    post(text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const pubId = this.publicationId;
            if (!pubId)
                return { success: false, error: 'No Hashnode publication found for this account' };
            const lines = text.split('\n');
            const title = lines[0].replace(/^#+\s*/, '').trim() || 'New Post';
            const contentMarkdown = lines.slice(1).join('\n').trim() || text;
            const resp = yield this.gql(`
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post { id url }
        }
      }
    `, {
                input: {
                    title,
                    contentMarkdown,
                    publicationId: pubId,
                    tags: [],
                },
            });
            if (!resp.ok)
                return { success: false, error: `${resp.status}` };
            const data = yield resp.json();
            const post = (_b = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.publishPost) === null || _b === void 0 ? void 0 : _b.post;
            if (!post)
                return { success: false, error: ((_d = (_c = data === null || data === void 0 ? void 0 : data.errors) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.message) || 'Unknown error' };
            return { success: true, id: post.id, data: { url: post.url } };
        });
    }
    searchPosts(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10, subreddit) {
            var _a, _b;
            const resp = yield this.gql(`
      query SearchPosts($query: String!, $first: Int) {
        searchPostsOfPublication(first: $first, filter: { query: $query }) {
          edges { node { id title author { username } } }
        }
      }
    `, { query, first: limit });
            if (!resp.ok)
                return [];
            const data = yield resp.json();
            const edges = ((_b = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.searchPostsOfPublication) === null || _b === void 0 ? void 0 : _b.edges) || [];
            return edges.map((e) => {
                var _a;
                return ({
                    id: e.node.id,
                    text: e.node.title,
                    author: ((_a = e.node.author) === null || _a === void 0 ? void 0 : _a.username) || '',
                });
            });
        });
    }
    comment(postId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const resp = yield this.gql(`
      mutation AddComment($input: AddCommentInput!) {
        addComment(input: $input) {
          comment { id }
        }
      }
    `, { input: { postId, contentMarkdown: text } });
            if (!resp.ok)
                return { success: false, error: `${resp.status}` };
            const data = yield resp.json();
            return { success: !!((_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a.addComment) === null || _b === void 0 ? void 0 : _b.comment) === null || _c === void 0 ? void 0 : _c.id) };
        });
    }
    like(postId) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.gql(`
      mutation LikePost($input: LikePostInput!) {
        likePost(input: $input) { post { id } }
      }
    `, { input: { postId, likesCount: 1 } });
            return { success: resp.ok };
        });
    }
    getMentions() {
        return __awaiter(this, void 0, void 0, function* () { return []; });
    }
    reply(commentId, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.gql(`
      mutation ReplyToComment($input: ReplyToCommentInput!) {
        replyToComment(input: $input) { reply { id } }
      }
    `, { input: { commentId, contentMarkdown: text } });
            return { success: resp.ok };
        });
    }
}
//# sourceMappingURL=hashnode.client.js.map