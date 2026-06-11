import { __awaiter } from "tslib";
/**
 * EngagerSubAgent
 * Drains the "like" and "repost" action queue from SharedState.
 * Runs more frequently than Commenter to keep engagement velocity up.
 */
import { BaseSubAgent } from './base.sub-agent';
export class EngagerSubAgent extends BaseSubAgent {
    constructor(client, state, config) {
        var _a;
        // Engage every 10 minutes
        super('Engager', client, state, Object.assign(Object.assign({}, config), { intervalMs: (_a = config.intervalMs) !== null && _a !== void 0 ? _a : 10 * 60000 }));
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Find "like" or "repost" actions
            const action = this.state.actionQueue.find((a) => a.type === 'like' || a.type === 'repost');
            if (!action) {
                this.logger.debug('No engagement actions queued');
                return true;
            }
            // Remove from queue
            const idx = this.state.actionQueue.indexOf(action);
            if (idx !== -1)
                this.state.actionQueue.splice(idx, 1);
            yield this.delay(500, 3000);
            let result;
            if (action.type === 'like') {
                this.logger.log(`Liking post ${action.postId}`);
                result = yield this.client.like(action.postId, action.extra);
            }
            else {
                this.logger.log(`Reposting post ${action.postId}`);
                // Not all clients have repost — fall back to like
                const clientAny = this.client;
                if (typeof clientAny.repost === 'function') {
                    result = yield clientAny.repost(action.postId, action.extra);
                }
                else {
                    result = yield this.client.like(action.postId, action.extra);
                }
            }
            if (result === null || result === void 0 ? void 0 : result.success) {
                this.logger.log(`${action.type} on ${action.postId} succeeded`);
            }
            else {
                this.logger.warn(`${action.type} on ${action.postId} failed: ${result === null || result === void 0 ? void 0 : result.error}`);
            }
            return (_a = result === null || result === void 0 ? void 0 : result.success) !== null && _a !== void 0 ? _a : false;
        });
    }
}
//# sourceMappingURL=engager.sub-agent.js.map