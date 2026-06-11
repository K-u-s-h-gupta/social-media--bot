import { __awaiter } from "tslib";
/**
 * CommanderAgent
 * One Commander per credential. Forks typed sub-agents that share
 * one authenticated client session and one SharedState.
 *
 * Lifecycle:
 *   commander.start()  → all sub-agents start their loops
 *   commander.pause()  → all loops pause
 *   commander.resume() → all loops resume
 *   commander.stop()   → all loops stop, client cleaned up
 *
 * Per-sub-agent control:
 *   commander.pauseAgent(name)  → pause a specific sub-agent
 *   commander.resumeAgent(name) → resume a specific sub-agent
 *   commander.stopAgent(name)   → stop a specific sub-agent permanently
 *
 * Direct command:
 *   commander.executeCommand(cmd) → run an action immediately
 */
import { Logger } from '@nestjs/common';
import { SharedState } from './sub-agents/shared-state';
import { ScoutSubAgent } from './sub-agents/scout.sub-agent';
import { PosterSubAgent } from './sub-agents/poster.sub-agent';
import { CommenterSubAgent } from './sub-agents/commenter.sub-agent';
import { EngagerSubAgent } from './sub-agents/engager.sub-agent';
import { ResponderSubAgent } from './sub-agents/responder.sub-agent';
export class CommanderAgent {
    constructor(key, client, config, onAction) {
        this.key = key;
        this.client = client;
        this.config = config;
        this.onAction = onAction;
        this.subAgents = [];
        this._running = false;
        this.logger = new Logger(`Commander:${key}`);
        this.state = new SharedState();
        this.state.context = {
            niche: config.niche,
            tone: config.tone,
            hashtags: config.hashtags,
        };
        // Inject action callback into SharedState so sub-agents can report
        this.state._onAction = this.logAction.bind(this);
        this.buildSubAgents();
    }
    logAction(entry) {
        const full = Object.assign(Object.assign({}, entry), { timestamp: new Date().toISOString() });
        if (this.onAction)
            this.onAction(full);
    }
    buildSubAgents() {
        var _a, _b, _c, _d, _e, _f, _g;
        const enabled = (_a = this.config.enabledAgents) !== null && _a !== void 0 ? _a : ['scout', 'poster', 'commenter', 'engager', 'responder'];
        const intervals = (_b = this.config.intervals) !== null && _b !== void 0 ? _b : {};
        const make = (name, Cls, ivMs) => {
            if (!enabled.includes(name))
                return;
            const cfg = Object.assign(Object.assign({}, this.config), { intervalMs: ivMs });
            const agent = new Cls(this.client, this.state, cfg);
            // Inject action reporter into each sub-agent
            agent._onAction = this.logAction.bind(this);
            this.subAgents.push({ name, agent });
        };
        make('scout', ScoutSubAgent, (_c = intervals.scout) !== null && _c !== void 0 ? _c : 5 * 60000);
        make('poster', PosterSubAgent, (_d = intervals.poster) !== null && _d !== void 0 ? _d : 2 * 60 * 60000);
        make('commenter', CommenterSubAgent, (_e = intervals.commenter) !== null && _e !== void 0 ? _e : 15 * 60000);
        make('engager', EngagerSubAgent, (_f = intervals.engager) !== null && _f !== void 0 ? _f : 10 * 60000);
        make('responder', ResponderSubAgent, (_g = intervals.responder) !== null && _g !== void 0 ? _g : 30 * 60000);
    }
    start() {
        if (this._running)
            return;
        this._running = true;
        this.logger.log(`Starting with ${this.subAgents.length} sub-agents`);
        for (const { name, agent } of this.subAgents) {
            agent.start();
            this.logger.log(`  ↳ ${name} started`);
        }
        this.logAction({ agentType: 'commander', actionType: 'start', status: 'success', detail: `Commander started with agents: ${this.subAgents.map(a => a.name).join(', ')}` });
    }
    pause() {
        this.logger.log('Pausing all sub-agents');
        for (const { agent } of this.subAgents)
            agent.pause();
        this.logAction({ agentType: 'commander', actionType: 'pause', status: 'success', detail: 'All agents paused' });
    }
    resume() {
        this.logger.log('Resuming all sub-agents');
        for (const { agent } of this.subAgents)
            agent.resume();
        this.logAction({ agentType: 'commander', actionType: 'resume', status: 'success', detail: 'All agents resumed' });
    }
    stop() {
        this._running = false;
        this.logger.log('Stopping all sub-agents');
        for (const { agent } of this.subAgents)
            agent.stop();
        this.logAction({ agentType: 'commander', actionType: 'stop', status: 'success', detail: 'All agents stopped' });
    }
    // ─── Per-sub-agent control ────────────────────────────────────────────────
    pauseAgent(name) {
        const entry = this.subAgents.find((a) => a.name === name);
        if (entry) {
            entry.agent.pause();
            this.logAction({ agentType: name, actionType: 'pause', status: 'success', detail: `${name} paused` });
        }
    }
    resumeAgent(name) {
        const entry = this.subAgents.find((a) => a.name === name);
        if (entry) {
            entry.agent.resume();
            this.logAction({ agentType: name, actionType: 'resume', status: 'success', detail: `${name} resumed` });
        }
    }
    stopAgent(name) {
        const entry = this.subAgents.find((a) => a.name === name);
        if (entry) {
            entry.agent.stop();
            this.subAgents = this.subAgents.filter((a) => a.name !== name);
            this.logAction({ agentType: name, actionType: 'stop', status: 'success', detail: `${name} stopped permanently` });
        }
    }
    // ─── Direct command execution ─────────────────────────────────────────────
    executeCommand(cmd) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            this.logAction({
                agentType: 'manual',
                actionType: cmd.type,
                status: 'success',
                detail: `Manual command: ${cmd.type} — ${((_a = cmd.text) === null || _a === void 0 ? void 0 : _a.slice(0, 80)) || cmd.query || cmd.postId || ''}`,
                metadata: cmd,
            });
            try {
                let result;
                switch (cmd.type) {
                    case 'post':
                        result = yield this.client.post(cmd.text || '');
                        break;
                    case 'comment':
                        result = yield this.client.comment(cmd.postId || '', cmd.text || '');
                        break;
                    case 'like':
                        result = yield this.client.like(cmd.postId || '');
                        break;
                    case 'repost':
                        result = (yield ((_c = (_b = this.client).repost) === null || _c === void 0 ? void 0 : _c.call(_b, cmd.postId || ''))) || { success: false, error: 'repost not supported' };
                        break;
                    case 'search': {
                        const posts = yield this.client.searchPosts(cmd.query || '', 5);
                        // Enqueue found posts for commenting/liking
                        for (const p of posts) {
                            this.state.enqueueAction({ type: 'comment', postId: p.id, text: undefined, extra: Object.assign({ postText: p.text }, p.extra) });
                        }
                        result = { success: true, data: { found: posts.length, query: cmd.query } };
                        break;
                    }
                    case 'reply':
                        result = yield this.client.reply(cmd.postId || '', cmd.text || '');
                        break;
                    default:
                        result = { success: false, error: `Unknown command type: ${cmd.type}` };
                }
                this.logAction({
                    agentType: 'manual',
                    actionType: cmd.type,
                    status: result.success ? 'success' : 'error',
                    detail: result.success
                        ? `✓ ${cmd.type} executed${result.id ? ` (id: ${result.id})` : ''}`
                        : `✗ ${cmd.type} failed: ${result.error}`,
                    metadata: result,
                });
                return result;
            }
            catch (err) {
                this.logAction({ agentType: 'manual', actionType: cmd.type, status: 'error', detail: `Exception: ${err.message}` });
                return { success: false, error: err.message };
            }
        });
    }
    // ─── Status ───────────────────────────────────────────────────────────────
    isRunning() { return this._running; }
    getStatus() {
        return {
            key: this.key,
            running: this._running,
            platform: this.client.platform,
            config: {
                niche: this.config.niche,
                tone: this.config.tone,
                hashtags: this.config.hashtags,
            },
            sharedState: this.state.getSummary(),
            subAgents: this.subAgents.map(({ name, agent }) => {
                var _a, _b, _c, _d;
                return ({
                    name,
                    running: (_b = (_a = agent.isRunning) === null || _a === void 0 ? void 0 : _a.call(agent)) !== null && _b !== void 0 ? _b : false,
                    paused: (_d = (_c = agent.isPaused) === null || _c === void 0 ? void 0 : _c.call(agent)) !== null && _d !== void 0 ? _d : false,
                });
            }),
        };
    }
}
//# sourceMappingURL=commander.agent.js.map