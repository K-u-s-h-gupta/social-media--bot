import { __awaiter } from "tslib";
/**
 * ScoutSubAgent
 * Runs first — discovers trending posts in the niche and fills SharedState.
 * Other sub-agents consume what Scout finds.
 */
import { BaseSubAgent } from './base.sub-agent';
export class ScoutSubAgent extends BaseSubAgent {
    constructor(client, state, config) {
        var _a;
        // Scout runs every 5 minutes — more frequent so other agents always have fresh data
        super('Scout', client, state, Object.assign(Object.assign({}, config), { intervalMs: (_a = config.intervalMs) !== null && _a !== void 0 ? _a : 5 * 60000 }));
        this.queryIndex = 0;
        this.queries = [];
        this.buildQueries();
    }
    buildQueries() {
        const { niche, hashtags } = this.config;
        this.queries = [
            niche,
            ...hashtags.map((h) => h.startsWith('#') ? h.slice(1) : h),
            `${niche} tips`,
            `${niche} news`,
            `${niche} trends`,
        ].filter(Boolean);
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            const query = this.queries[this.queryIndex % this.queries.length];
            this.queryIndex++;
            this.logger.log(`Scouting: "${query}"`);
            const posts = yield this.client.searchPosts(query, 10);
            if (!posts.length) {
                this.logger.debug(`No results for "${query}"`);
                return false;
            }
            this.state.addTrending({
                query,
                posts,
                fetchedAt: Date.now(),
            });
            // Queue top posts for engagement
            for (const post of posts.slice(0, 3)) {
                this.state.enqueueAction({ type: 'like', postId: post.id, extra: post.extra, priority: 1 });
                this.state.enqueueAction({
                    type: 'comment',
                    postId: post.id,
                    text: '', // Commenter will generate actual text
                    extra: Object.assign(Object.assign({}, post.extra), { postText: post.text, author: post.author }),
                    priority: 2,
                });
            }
            this.logger.log(`Scouted ${posts.length} posts for "${query}" — queued ${Math.min(3, posts.length)} for engagement`);
            return true;
        });
    }
}
//# sourceMappingURL=scout.sub-agent.js.map