/**
 * PosterSubAgent
 * Posts original content based on trending topics from SharedState.
 * Uses a bank of content templates and injects trending context.
 */
import { BaseSubAgent, SubAgentConfig } from './base.sub-agent';
import { BasePlatformClient } from '../platform-clients/base.client';
import { SharedState } from './shared-state';

const POST_TEMPLATES = [
  '🔥 {topic} is trending right now! Here\'s my take: {insight}\n\n{hashtags}',
  'Did you know? {insight}\n\nThis is huge for anyone in {niche}.\n\n{hashtags}',
  'Quick thought on {topic} 👇\n\n{insight}\n\n{hashtags}',
  'Hot take on {topic}:\n\n{insight}\n\nAgree? Drop your thoughts 👇\n\n{hashtags}',
  'The {niche} space is buzzing about {topic}.\n\n{insight}\n\n{hashtags}',
  '3 things to know about {topic} today:\n1. It\'s trending\n2. {insight}\n3. Follow for more!\n\n{hashtags}',
];

const INSIGHTS: Record<string, string[]> = {
  default: [
    'the fundamentals still matter most',
    'consistency beats motivation every time',
    'the best time to start was yesterday, the second best is now',
    'small daily improvements compound into massive results',
    'your network is your net worth',
  ],
};

export class PosterSubAgent extends BaseSubAgent {
  private templateIndex = 0;
  private insightIndex = 0;

  constructor(
    client: BasePlatformClient,
    state: SharedState,
    config: SubAgentConfig,
  ) {
    // Post every 2 hours by default
    super('Poster', client, state, { ...config, intervalMs: config.intervalMs ?? 2 * 60 * 60_000 });
  }

  protected async tick(): Promise<boolean> {
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
    await this.delay(1000, 5000);

    this.logger.log(`Posting about "${topic}" (${text.length} chars)`);
    const result = await this.client.post(text);

    if (result.success && result.id) {
      this.state.recordPost(result.id);
      this.logger.log(`Posted successfully: ${result.id}`);
    } else {
      this.logger.warn(`Post failed: ${result.error}`);
    }

    return result.success;
  }

  private pickTopic(): string {
    if (this.state.trending.length > 0) {
      const idx = Math.floor(Math.random() * Math.min(5, this.state.trending.length));
      return this.state.trending[idx]?.query ?? this.config.niche;
    }
    return this.config.niche;
  }

  private pickInsight(): string {
    const pool = INSIGHTS[this.config.niche] ?? INSIGHTS.default;
    const idx = this.insightIndex % pool.length;
    this.insightIndex++;
    return pool[idx];
  }
}
