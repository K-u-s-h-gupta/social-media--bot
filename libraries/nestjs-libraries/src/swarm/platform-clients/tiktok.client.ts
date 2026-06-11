/**
 * TikTok client — browser automation via Playwright.
 * Uses email/password login. TikTok has strong anti-bot measures.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

export class TikTokClient extends BasePlatformClient {
  constructor() { super('tiktok'); }

  async login(email: string, password: string): Promise<SessionData> {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as any).chrome = { runtime: {} };
    });

    try {
      await page.goto('https://www.tiktok.com/login/phone-or-email/email', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      await page.fill('input[name="username"], input[type="text"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"], button[data-e2e="login-button"]');
      await page.waitForTimeout(5000);

      const cookies = await ctx.cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) cookieMap[c.name] = c.value;

      const session: SessionData = {
        token: cookieMap['sessionid'] || cookieMap['sid_tt'] || '',
        cookies: cookieMap,
        extra: { email },
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      this.session = session;
      return session;
    } finally {
      await browser.close();
    }
  }

  async post(text: string): Promise<ActionResult> {
    // TikTok video posting requires video upload — text-only not standard
    return { success: false, error: 'TikTok requires video content. Text-only posts not supported.' };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    try {
      const resp = await fetch(
        `https://www.tiktok.com/api/search/general/full/?keyword=${encodeURIComponent(query)}&count=${limit}`,
        {
          headers: {
            Cookie: this.cookieHeader(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
          },
        }
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      return (data.data || []).slice(0, limit).map((item: any) => ({
        id: item?.item?.video?.id || '',
        text: item?.item?.desc || '',
        author: item?.item?.author?.uniqueId || '',
      }));
    } catch { return []; }
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    return { success: false, error: 'TikTok comment requires app session' };
  }

  async like(postId: string): Promise<ActionResult> {
    return { success: false, error: 'TikTok like requires app session' };
  }

  async getMentions(): Promise<Mention[]> { return []; }
  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }

  private cookieHeader(): string {
    return Object.entries(this.session?.cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}
