export class SharedState {
    constructor() {
        /** Trending topics as populated by ScoutSubAgent */
        this.trending = [];
        /** Pending engagement actions queued by Scout for Engager */
        this.actionQueue = [];
        /** Last N posted content IDs to avoid duplicate posts */
        this.recentPostIds = [];
        /** Free-form context passed down from Commander (niche, tone, etc.) */
        this.context = {};
        /** Running stats per agent */
        this.stats = {};
    }
    addTrending(topic) {
        // Keep only the latest 20 topics, deduplicate by query
        this.trending = [topic, ...this.trending.filter((t) => t.query !== topic.query)].slice(0, 20);
    }
    popAction() {
        // Sort by priority descending, then pop from front
        this.actionQueue.sort((a, b) => { var _a, _b; return ((_a = b.priority) !== null && _a !== void 0 ? _a : 0) - ((_b = a.priority) !== null && _b !== void 0 ? _b : 0); });
        return this.actionQueue.shift();
    }
    enqueueAction(action) {
        // Deduplicate by postId+type
        const exists = this.actionQueue.some((a) => a.postId === action.postId && a.type === action.type);
        if (!exists)
            this.actionQueue.push(action);
    }
    recordPost(postId) {
        this.recentPostIds = [postId, ...this.recentPostIds].slice(0, 50);
    }
    trackStat(agentName, success) {
        if (!this.stats[agentName])
            this.stats[agentName] = { runs: 0, successes: 0, errors: 0 };
        this.stats[agentName].runs++;
        if (success)
            this.stats[agentName].successes++;
        else
            this.stats[agentName].errors++;
    }
    getSummary() {
        return {
            trendingCount: this.trending.length,
            actionQueueLength: this.actionQueue.length,
            recentPosts: this.recentPostIds.length,
            stats: this.stats,
        };
    }
}
//# sourceMappingURL=shared-state.js.map