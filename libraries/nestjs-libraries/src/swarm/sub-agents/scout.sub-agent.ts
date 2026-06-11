/**
 * ScoutSubAgent
 * Runs first — discovers trending posts in the niche and fills SharedState.
 * Other sub-agents consume what Scout finds.
 */
import { BaseSubAgent, SubAgentConfig } from './base.sub-agent';
import { BasePlatformClient } from '../platform-clients/base.client';
import { SharedState } from './shared-state';

export class ScoutSubAgent extends BaseSubAgent {
  private queryIndex = 0;
  private queries: string[] = [];

  constructor(
    client: BasePlatformClient,
    state: SharedState,
    config: SubAgentConfig,
  ) {
    // Scout runs every 5 minutes — more frequent so other agents always have fresh data
    super('Scout', client, state, { ...config, intervalMs: config.intervalMs ?? 5 * 60_000 });
    this.buildQueries();
  }

  private buildQueries(): void {
    const { niche, hashtags } = this.config;
    this.queries = [
      niche,
      ...hashtags.map((h) => h.startsWith('#') ? h.slice(1) : h),
      `${niche} tips`,
      `${niche} news`,
      `${niche} trends`,
    ].filter(Boolean);
  }

  protected async tick(): Promise<boolean> {
    const query = this.queries[this.queryIndex % this.queries.length];
    this.queryIndex++;

    this.logger.log(`Scouting: "${query}"`);

    const posts = await this.client.searchPosts(query, 10);
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
        extra: { ...post.extra, postText: post.text, author: post.author },
        priority: 2,
      });
    }

    this.logger.log(`Scouted ${posts.length} posts for "${query}" — queued ${Math.min(3, posts.length)} for engagement`);
    return true;
  }
}
