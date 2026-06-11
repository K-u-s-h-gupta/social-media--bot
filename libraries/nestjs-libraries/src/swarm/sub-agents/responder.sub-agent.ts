/**
 * ResponderSubAgent
 * Monitors mentions and replies to them.
 * Keeps the account appearing active and engaged.
 */
import { BaseSubAgent, SubAgentConfig } from './base.sub-agent';
import { BasePlatformClient } from '../platform-clients/base.client';
import { SharedState } from './shared-state';

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
  private templateIndex = 0;
  private readonly repliedIds = new Set<string>();

  constructor(
    client: BasePlatformClient,
    state: SharedState,
    config: SubAgentConfig,
  ) {
    // Check mentions every 30 minutes
    super('Responder', client, state, { ...config, intervalMs: config.intervalMs ?? 30 * 60_000 });
  }

  protected async tick(): Promise<boolean> {
    const mentions = await this.client.getMentions(20);

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

    await this.delay(3000, 10000);

    this.logger.log(`Replying to mention ${mention.id} from @${mention.author}`);
    const result = await this.client.reply(mention.id, text, mention.extra);

    if (result.success) {
      this.logger.log(`Reply sent: ${result.id ?? 'ok'}`);
    } else {
      this.logger.warn(`Reply failed: ${result.error}`);
      this.repliedIds.delete(mention.id); // Retry next run
    }

    return result.success;
  }
}
