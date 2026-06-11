/**
 * SharedState is an in-memory board that sub-agents write/read from.
 * Scout fills trending topics → Poster/Commenter/Engager consume them.
 * One SharedState instance per Commander (i.e. per credential).
 */
export interface TrendingTopic {
  query: string;
  posts: Array<{
    id: string;
    text: string;
    author: string;
    extra?: any;
  }>;
  fetchedAt: number;
}

export interface QueuedAction {
  type: 'like' | 'comment' | 'repost' | 'reply';
  postId: string;
  text?: string;
  extra?: any;
  priority?: number;
}

export class SharedState {
  /** Trending topics as populated by ScoutSubAgent */
  trending: TrendingTopic[] = [];

  /** Pending engagement actions queued by Scout for Engager */
  actionQueue: QueuedAction[] = [];

  /** Last N posted content IDs to avoid duplicate posts */
  recentPostIds: string[] = [];

  /** Free-form context passed down from Commander (niche, tone, etc.) */
  context: Record<string, any> = {};

  /** Running stats per agent */
  stats: Record<string, { runs: number; successes: number; errors: number }> = {};

  addTrending(topic: TrendingTopic) {
    // Keep only the latest 20 topics, deduplicate by query
    this.trending = [topic, ...this.trending.filter((t) => t.query !== topic.query)].slice(0, 20);
  }

  popAction(): QueuedAction | undefined {
    // Sort by priority descending, then pop from front
    this.actionQueue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return this.actionQueue.shift();
  }

  enqueueAction(action: QueuedAction) {
    // Deduplicate by postId+type
    const exists = this.actionQueue.some(
      (a) => a.postId === action.postId && a.type === action.type,
    );
    if (!exists) this.actionQueue.push(action);
  }

  recordPost(postId: string) {
    this.recentPostIds = [postId, ...this.recentPostIds].slice(0, 50);
  }

  trackStat(agentName: string, success: boolean) {
    if (!this.stats[agentName]) this.stats[agentName] = { runs: 0, successes: 0, errors: 0 };
    this.stats[agentName].runs++;
    if (success) this.stats[agentName].successes++;
    else this.stats[agentName].errors++;
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
