/**
 * EngagerSubAgent
 * Drains the "like" and "repost" action queue from SharedState.
 * Runs more frequently than Commenter to keep engagement velocity up.
 */
import { BaseSubAgent, SubAgentConfig } from './base.sub-agent';
import { BasePlatformClient } from '../platform-clients/base.client';
import { SharedState } from './shared-state';

export class EngagerSubAgent extends BaseSubAgent {
  constructor(
    client: BasePlatformClient,
    state: SharedState,
    config: SubAgentConfig,
  ) {
    // Engage every 10 minutes
    super('Engager', client, state, { ...config, intervalMs: config.intervalMs ?? 10 * 60_000 });
  }

  protected async tick(): Promise<boolean> {
    // Find "like" or "repost" actions
    const action = this.state.actionQueue.find(
      (a) => a.type === 'like' || a.type === 'repost',
    );

    if (!action) {
      this.logger.debug('No engagement actions queued');
      return true;
    }

    // Remove from queue
    const idx = this.state.actionQueue.indexOf(action);
    if (idx !== -1) this.state.actionQueue.splice(idx, 1);

    await this.delay(500, 3000);

    let result;
    if (action.type === 'like') {
      this.logger.log(`Liking post ${action.postId}`);
      result = await this.client.like(action.postId, action.extra);
    } else {
      this.logger.log(`Reposting post ${action.postId}`);
      // Not all clients have repost — fall back to like
      const clientAny = this.client as any;
      if (typeof clientAny.repost === 'function') {
        result = await clientAny.repost(action.postId, action.extra);
      } else {
        result = await this.client.like(action.postId, action.extra);
      }
    }

    if (result?.success) {
      this.logger.log(`${action.type} on ${action.postId} succeeded`);
    } else {
      this.logger.warn(`${action.type} on ${action.postId} failed: ${result?.error}`);
    }

    return result?.success ?? false;
  }
}
