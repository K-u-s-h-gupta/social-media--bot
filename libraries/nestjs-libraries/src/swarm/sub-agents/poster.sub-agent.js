import { __awaiter } from "tslib";
/**
 * PosterSubAgent
 * Posts original content based on trending topics from SharedState.
 * Uses a bank of content templates and injects trending context.
 */
import { BaseSubAgent } from './base.sub-agent';
const POST_TEMPLATES = [
    '🔥 {topic} is trending right now! Here\'s my take: {insight}\n\n{hashtags}',
    'Did you know? {insight}\n\nThis is huge for anyone in {niche}.\n\n{hashtags}',
    'Quick thought on {topic} 👇\n\n{insight}\n\n{hashtags}',
    'Hot take on {topic}:\n\n{insight}\n\nAgree? Drop your thoughts 👇\n\n{hashtags}',
    'The {niche} space is buzzing about {topic}.\n\n{insight}\n\n{hashtags}',
    '3 things to know about {topic} today:\n1. It\'s trending\n2. {insight}\n3. Follow for more!\n\n{hashtags}',
];
const INSIGHTS = {
    default: [
        'the fundamentals still matter most',
        'consistency beats motivation every time',
        'the best time to start was yesterday, the second best is now',
        'small daily improvements compound into massive results',
        'your network is your net worth',
    ],
};
export class PosterSubAgent extends BaseSubAgent {
    constructor(client, state, config) {
        var _a;
        // Post every 2 hours by default
        super('Poster', client, state, Object.assign(Object.assign({}, config), { intervalMs: (_a = config.intervalMs) !== null && _a !== void 0 ? _a : 2 * 60 * 60000 }));
        this.templateIndex = 0;
        this.insightIndex = 0;
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            const topic = this.pickTopic();
            const insight = this.pickInsight();
            const template = POST_TEMPLATES[this.templateIndex % POST_TEMPLATES.length];
            this.templateIndex++;
            const hashtags = this.config.hashtags.slice(0, 5).join(' ');
            const text = this.buildContent(template, {
                topic,
                niche: this.config.niche,
                insight,
                hashtags,
            });
            // Human-like delay before posting
            yield this.delay(1000, 5000);
            this.logger.log(`Posting about "${topic}" (${text.length} chars)`);
            const result = yield this.client.post(text);
            if (result.success && result.id) {
                this.state.recordPost(result.id);
                this.logger.log(`Posted successfully: ${result.id}`);
            }
            else {
                this.logger.warn(`Post failed: ${result.error}`);
            }
            return result.success;
        });
    }
    pickTopic() {
        var _a, _b;
        if (this.state.trending.length > 0) {
            const idx = Math.floor(Math.random() * Math.min(5, this.state.trending.length));
            return (_b = (_a = this.state.trending[idx]) === null || _a === void 0 ? void 0 : _a.query) !== null && _b !== void 0 ? _b : this.config.niche;
        }
        return this.config.niche;
    }
    pickInsight() {
        var _a;
        const pool = (_a = INSIGHTS[this.config.niche]) !== null && _a !== void 0 ? _a : INSIGHTS.default;
        const idx = this.insightIndex % pool.length;
        this.insightIndex++;
        return pool[idx];
    }
}
//# sourceMappingURL=poster.sub-agent.js.map