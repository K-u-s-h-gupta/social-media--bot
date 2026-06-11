/**
 * Facebook client — browser automation via Playwright.
 * Logs in with email + password (no API keys needed).
 * Note: Facebook has strong anti-bot measures. Use sparingly.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

export class FacebookClient extends BasePlatformClient {
  constructor() { super('facebook'); }

  async login(email: string, password: string): Promise<SessionData> {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#email', { timeout: 15000 });
      await page.fill('#email', email);
      await page.fill('#pass', password);
      await page.click('[name="login"]');
      await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });

      const cookies = await ctx.cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) cookieMap[c.name] = c.value;

      const session: SessionData = {
        token: cookieMap['c_user'] || '',
        cookies: cookieMap,
        extra: { uid: cookieMap['c_user'] },
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      this.session = session;
      return session;
    } finally {
      await browser.close();
    }
  }

  private cookieHeader(): string {
    return Object.entries(this.session?.cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async post(text: string): Promise<ActionResult> {
    // Facebook Graph-less approach: not trivial without token.
    // For now log the action — full browser post is complex.
    return { success: false, error: 'Facebook posting requires a Page token. Use the browser session for basic browsing.' };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    return [];
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    return { success: false, error: 'Facebook comment not implemented' };
  }

  async like(postId: string): Promise<ActionResult> {
    return { success: false, error: 'Facebook like not implemented' };
  }

  async getMentions(): Promise<Mention[]> { return []; }
  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }
}
