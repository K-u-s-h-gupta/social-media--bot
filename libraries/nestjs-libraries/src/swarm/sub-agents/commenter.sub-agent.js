import { __awaiter } from "tslib";
/**
 * CommenterSubAgent
 * Drains the "comment" action queue populated by ScoutSubAgent.
 * Generates contextual comments based on post content.
 */
import { BaseSubAgent } from './base.sub-agent';
const COMMENT_TEMPLATES = [
    'Great point! {insight}',
    'This resonates a lot. {insight} 🙌',
    'Totally agree — {insight}. Keep it up!',
    'Love this take on {topic}. {insight}',
    'Couldn\'t have said it better. {insight} 💯',
    'This is so important for anyone in {niche}. {insight}',
    'Spot on! {insight} — thanks for sharing.',
    '🔥 {insight}. Following for more content like this.',
    'Real talk: {insight}. More people need to see this.',
    'Bookmarked. {insight} — pure gold.',
];
const POSITIVE_SENTIMENTS = [
    'solid perspective worth sharing',
    'the community needed to hear this',
    'this is the kind of content that drives real value',
    'actionable insights like these are rare',
    'this aligns with what the best in the field are saying',
];
export class CommenterSubAgent extends BaseSubAgent {
    constructor(client, state, config) {
        var _a;
        // Comment every 15 minutes — drain the queue gradually
        super('Commenter', client, state, Object.assign(Object.assign({}, config), { intervalMs: (_a = config.intervalMs) !== null && _a !== void 0 ? _a : 15 * 60000 }));
        this.templateIndex = 0;
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Only process "comment" type actions
            const action = this.state.actionQueue.find((a) => a.type === 'comment');
            if (!action) {
                this.logger.debug('No comments queued');
                return true; // Not a failure
            }
            // Remove it from queue
            const idx = this.state.actionQueue.indexOf(action);
            if (idx !== -1)
                this.state.actionQueue.splice(idx, 1);
            const topic = (((_a = action.extra) === null || _a === void 0 ? void 0 : _a.postText) || this.config.niche).slice(0, 50);
            const template = COMMENT_TEMPLATES[this.templateIndex % COMMENT_TEMPLATES.length];
            this.templateIndex++;
            const insight = POSITIVE_SENTIMENTS[Math.floor(Math.random() * POSITIVE_SENTIMENTS.length)];
            const text = this.buildContent(template, {
                topic,
                niche: this.config.niche,
                insight,
                tone: this.config.tone,
            });
            yield this.delay(2000, 8000);
            this.logger.log(`Commenting on post ${action.postId}: "${text.slice(0, 60)}..."`);
            const result = yield this.client.comment(action.postId, text, action.extra);
            if (result.success) {
                this.logger.log(`Comment posted: ${(_b = result.id) !== null && _b !== void 0 ? _b : 'ok'}`);
            }
            else {
                this.logger.warn(`Comment failed: ${result.error}`);
            }
            return result.success;
        });
    }
}
//# sourceMappingURL=commenter.sub-agent.js.map