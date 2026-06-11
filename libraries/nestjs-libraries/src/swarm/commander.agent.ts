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
import { BasePlatformClient, ActionResult } from './platform-clients/base.client';
import { SharedState } from './sub-agents/shared-state';
import { SubAgentConfig } from './sub-agents/base.sub-agent';
import { ScoutSubAgent } from './sub-agents/scout.sub-agent';
import { PosterSubAgent } from './sub-agents/poster.sub-agent';
import { CommenterSubAgent } from './sub-agents/commenter.sub-agent';
import { EngagerSubAgent } from './sub-agents/engager.sub-agent';
import { ResponderSubAgent } from './sub-agents/responder.sub-agent';

export interface CommanderConfig extends SubAgentConfig {
  /** Which sub-agents to enable. Default: all 5 */
  enabledAgents?: Array<'scout' | 'poster' | 'commenter' | 'engager' | 'responder'>;

  /** Override per-agent intervals */
  intervals?: {
    scout?: number;
    poster?: number;
    commenter?: number;
    engager?: number;
    responder?: number;
  };
}

export interface DirectCommand {
  type: 'post' | 'comment' | 'like' | 'search' | 'reply' | 'repost';
  text?: string;
  postId?: string;
  query?: string;
  imageUrl?: string;
  target?: string;
  /** If true, also add this as a recurring instruction */
  addToRecurring?: boolean;
}

export interface ActionLogEntry {
  agentType: string;
  actionType: string;
  status: 'success' | 'error' | 'skipped';
  detail: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export type ActionLogCallback = (entry: ActionLogEntry) => void;

export class CommanderAgent {
  private readonly logger: Logger;
  readonly state: SharedState;
  private subAgents: Array<{ name: string; agent: any }> = [];
  private _running = false;

  constructor(
    public readonly key: string,
    private readonly client: BasePlatformClient,
    private readonly config: CommanderConfig,
    private readonly onAction?: ActionLogCallback,
  ) {
    this.logger = new Logger(`Commander:${key}`);
    this.state = new SharedState();
    this.state.context = {
      niche: config.niche,
      tone: config.tone,
      hashtags: config.hashtags,
    };
    // Inject action callback into SharedState so sub-agents can report
    (this.state as any)._onAction = this.logAction.bind(this);
    this.buildSubAgents();
  }

  private logAction(entry: Omit<ActionLogEntry, 'timestamp'>) {
    const full: ActionLogEntry = { ...entry, timestamp: new Date().toISOString() };
    if (this.onAction) this.onAction(full);
  }

  private buildSubAgents() {
    const enabled = this.config.enabledAgents ?? ['scout', 'poster', 'commenter', 'engager', 'responder'];
    const intervals = this.config.intervals ?? {};

    const make = (name: string, Cls: any, ivMs?: number) => {
      if (!enabled.includes(name as any)) return;
      const cfg: SubAgentConfig = { ...this.config, intervalMs: ivMs };
      const agent = new Cls(this.client, this.state, cfg);
      // Inject action reporter into each sub-agent
      (agent as any)._onAction = this.logAction.bind(this);
      this.subAgents.push({ name, agent });
    };

    make('scout',     ScoutSubAgent,     intervals.scout     ?? 5 * 60_000);
    make('poster',    PosterSubAgent,    intervals.poster    ?? 2 * 60 * 60_000);
    make('commenter', CommenterSubAgent, intervals.commenter ?? 15 * 60_000);
    make('engager',   EngagerSubAgent,   intervals.engager   ?? 10 * 60_000);
    make('responder', ResponderSubAgent, intervals.responder ?? 30 * 60_000);
  }

  start() {
    if (this._running) return;
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
    for (const { agent } of this.subAgents) agent.pause();
    this.logAction({ agentType: 'commander', actionType: 'pause', status: 'success', detail: 'All agents paused' });
  }

  resume() {
    this.logger.log('Resuming all sub-agents');
    for (const { agent } of this.subAgents) agent.resume();
    this.logAction({ agentType: 'commander', actionType: 'resume', status: 'success', detail: 'All agents resumed' });
  }

  stop() {
    this._running = false;
    this.logger.log('Stopping all sub-agents');
    for (const { agent } of this.subAgents) agent.stop();
    this.logAction({ agentType: 'commander', actionType: 'stop', status: 'success', detail: 'All agents stopped' });
  }

  // ─── Per-sub-agent control ────────────────────────────────────────────────

  pauseAgent(name: string) {
    const entry = this.subAgents.find((a) => a.name === name);
    if (entry) {
      entry.agent.pause();
      this.logAction({ agentType: name, actionType: 'pause', status: 'success', detail: `${name} paused` });
    }
  }

  resumeAgent(name: string) {
    const entry = this.subAgents.find((a) => a.name === name);
    if (entry) {
      entry.agent.resume();
      this.logAction({ agentType: name, actionType: 'resume', status: 'success', detail: `${name} resumed` });
    }
  }

  stopAgent(name: string) {
    const entry = this.subAgents.find((a) => a.name === name);
    if (entry) {
      entry.agent.stop();
      this.subAgents = this.subAgents.filter((a) => a.name !== name);
      this.logAction({ agentType: name, actionType: 'stop', status: 'success', detail: `${name} stopped permanently` });
    }
  }

  // ─── Direct command execution ─────────────────────────────────────────────

  async executeCommand(cmd: DirectCommand): Promise<ActionResult> {
    this.logAction({
      agentType: 'manual',
      actionType: cmd.type,
      status: 'success',
      detail: `Manual command: ${cmd.type} — ${cmd.text?.slice(0, 80) || cmd.query || cmd.postId || ''}`,
      metadata: cmd,
    });

    try {
      let result: ActionResult;

      switch (cmd.type) {
        case 'post':
          result = await this.client.post(cmd.text || '');
          break;
        case 'comment':
          result = await this.client.comment(cmd.postId || '', cmd.text || '');
          break;
        case 'like':
          result = await this.client.like(cmd.postId || '');
          break;
        case 'repost':
          result = await this.client.repost?.(cmd.postId || '') || { success: false, error: 'repost not supported' };
          break;
        case 'search': {
          const posts = await this.client.searchPosts(cmd.query || '', 5);
          // Enqueue found posts for commenting/liking
          for (const p of posts) {
            this.state.enqueueAction({ type: 'comment', postId: p.id, text: undefined, extra: { postText: p.text, ...p.extra } });
          }
          result = { success: true, data: { found: posts.length, query: cmd.query } };
          break;
        }
        case 'reply':
          result = await this.client.reply(cmd.postId || '', cmd.text || '');
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
    } catch (err: any) {
      this.logAction({ agentType: 'manual', actionType: cmd.type, status: 'error', detail: `Exception: ${err.message}` });
      return { success: false, error: err.message };
    }
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
      subAgents: this.subAgents.map(({ name, agent }) => ({
        name,
        running: agent.isRunning?.() ?? false,
        paused: agent.isPaused?.() ?? false,
      })),
    };
  }
}
