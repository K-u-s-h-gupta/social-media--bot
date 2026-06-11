import { Logger } from '@nestjs/common';
import { BasePlatformClient } from '../platform-clients/base.client';
import { SharedState } from './shared-state';

export interface SubAgentConfig {
  niche: string;
  tone: string;
  hashtags: string[];
  /** Rate limiting: minimum ms between runs (default 60 000 = 1 min) */
  intervalMs?: number;
  /** Max consecutive errors before the loop pauses (default 5) */
  maxErrors?: number;
  /** IST active hours (0-23). Default 6–23 */
  activeHoursStart?: number;
  activeHoursEnd?: number;
}

export abstract class BaseSubAgent {
  protected readonly logger: Logger;
  protected running = false;
  protected paused = false;
  protected consecutiveErrors = 0;
  private loopHandle: NodeJS.Timeout | null = null;

  constructor(
    protected readonly name: string,
    protected readonly client: BasePlatformClient,
    protected readonly state: SharedState,
    protected readonly config: SubAgentConfig,
  ) {
    this.logger = new Logger(`SubAgent:${name}`);
  }

  /** Override in each sub-agent. Returns true on success. */
  protected abstract tick(): Promise<boolean>;

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.logger.log('Starting');
    this.schedule();
  }

  pause() {
    this.paused = true;
    this.logger.log('Paused');
  }

  resume() {
    this.paused = false;
    this.logger.log('Resumed');
  }

  stop() {
    this.running = false;
    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }
    this.logger.log('Stopped');
  }

  isRunning() { return this.running; }
  isPaused() { return this.paused; }

  private schedule() {
    if (!this.running) return;
    const interval = this.config.intervalMs ?? 60_000;
    this.loopHandle = setTimeout(() => this.runOnce(), interval);
  }

  private async runOnce() {
    if (!this.running) return;

    if (this.paused) {
      this.schedule();
      return;
    }

    if (!this.isActiveHour()) {
      this.logger.debug('Outside active hours — skipping');
      this.schedule();
      return;
    }

    try {
      const ok = await this.tick();
      this.state.trackStat(this.name, ok);
      if (ok) this.consecutiveErrors = 0;
      else this.consecutiveErrors++;
    } catch (err: any) {
      this.logger.error(`tick() threw: ${err.message}`);
      this.state.trackStat(this.name, false);
      this.consecutiveErrors++;
    }

    const maxErrors = this.config.maxErrors ?? 5;
    if (this.consecutiveErrors >= maxErrors) {
      this.logger.warn(`${maxErrors} consecutive errors — pausing for 10 minutes`);
      this.paused = true;
      setTimeout(() => {
        this.consecutiveErrors = 0;
        this.paused = false;
        this.logger.log('Resuming after error cooldown');
        this.schedule();
      }, 10 * 60_000);
      return;
    }

    this.schedule();
  }

  /** IST is UTC+5:30. Return true if current IST hour is within active window. */
  private isActiveHour(): boolean {
    const utcMs = Date.now();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istHour = new Date(utcMs + istOffsetMs).getUTCHours();
    const start = this.config.activeHoursStart ?? 6;
    const end = this.config.activeHoursEnd ?? 23;
    return istHour >= start && istHour <= end;
  }

  /** Build a simple AI-style prompt response. Falls back to template if no AI. */
  protected buildContent(template: string, vars: Record<string, string> = {}): string {
    let out = template;
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return out;
  }

  /** Random delay between min and max ms */
  protected delay(minMs: number, maxMs: number): Promise<void> {
    const ms = minMs + Math.random() * (maxMs - minMs);
    return new Promise((r) => setTimeout(r, ms));
  }
}
