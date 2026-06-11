import { __awaiter } from "tslib";
/**
 * ResponderSubAgent
 * Monitors mentions and replies to them.
 * Keeps the account appearing active and engaged.
 */
import { BaseSubAgent } from './base.sub-agent';
const REPLY_TEMPLATES = [
    'Thanks for the mention! {acknowledgment} 🙏',
    'Appreciate you! {acknowledgment}',
    'Great question! {acknowledgment}',
    'Glad you brought this up — {acknowledgment} 💪',
    '{acknowledgment} — always happy to connect! 👋',
    'Thanks for reaching out! {acknowledgment}',
];
const ACKNOWLEDGMENTS = [
    'excited to keep the conversation going',
    'this is exactly what our community is about',
    'let\'s keep exploring these ideas together',
    'always great to connect with like-minded folks',
    'stay tuned for more content on this topic',
    'the dialogue is what makes this space great',
];
export class ResponderSubAgent extends BaseSubAgent {
    constructor(client, state, config) {
        var _a;
        // Check mentions every 30 minutes
        super('Responder', client, state, Object.assign(Object.assign({}, config), { intervalMs: (_a = config.intervalMs) !== null && _a !== void 0 ? _a : 30 * 60000 }));
        this.templateIndex = 0;
        this.repliedIds = new Set();
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const mentions = yield this.client.getMentions(20);
            if (!mentions.length) {
                this.logger.debug('No new mentions');
                return true;
            }
            // Filter already-replied
            const fresh = mentions.filter((m) => !this.repliedIds.has(m.id));
            if (!fresh.length) {
                this.logger.debug('All mentions already replied to');
                return true;
            }
            // Reply to the first fresh mention
            const mention = fresh[0];
            this.repliedIds.add(mention.id);
            const template = REPLY_TEMPLATES[this.templateIndex % REPLY_TEMPLATES.length];
            this.templateIndex++;
            const ack = ACKNOWLEDGMENTS[Math.floor(Math.random() * ACKNOWLEDGMENTS.length)];
            const text = this.buildContent(template, {
                acknowledgment: ack,
                niche: this.config.niche,
            });
            yield this.delay(3000, 10000);
            this.logger.log(`Replying to mention ${mention.id} from @${mention.author}`);
            const result = yield this.client.reply(mention.id, text, mention.extra);
            if (result.success) {
                this.logger.log(`Reply sent: ${(_a = result.id) !== null && _a !== void 0 ? _a : 'ok'}`);
            }
            else {
                this.logger.warn(`Reply failed: ${result.error}`);
                this.repliedIds.delete(mention.id); // Retry next run
            }
            return result.success;
        });
    }
}
//# sourceMappingURL=responder.sub-agent.js.map