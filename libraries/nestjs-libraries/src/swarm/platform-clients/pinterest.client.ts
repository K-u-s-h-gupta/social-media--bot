/**
 * Pinterest client — browser automation via Playwright.
 * Logs in with email + password. No API keys needed.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

export class PinterestClient extends BasePlatformClient {
  constructor() { super('pinterest'); }

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
      await page.goto('https://www.pinterest.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('input[id="email"]', { timeout: 15000 });
      await page.fill('input[id="email"]', email);
      await page.fill('input[id="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 30000 });
      await page.waitForTimeout(2000);

      const cookies = await ctx.cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) cookieMap[c.name] = c.value;

      // Extract CSRFToken
      const csrfToken = cookieMap['csrftoken'] || '';

      const session: SessionData = {
        token: cookieMap['_auth'] || '',
        cookies: cookieMap,
        extra: { csrfToken, email },
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

  private async req(path: string, method = 'GET', body?: any): Promise<Response> {
    const csrfToken = this.session?.extra?.csrfToken || '';
    return fetch(`https://www.pinterest.com/resource${path}`, {
      method,
      headers: {
        'Cookie': this.cookieHeader(),
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...(body ? { body: new URLSearchParams({ data: JSON.stringify(body) }).toString() } : {}),
    });
  }

  async post(text: string, boardId?: string): Promise<ActionResult> {
    // Pinterest "Pin" creation requires image URL + board
    return { success: false, error: 'Pinterest requires an image URL. Use the command panel with imageUrl parameter.' };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    try {
      const resp = await fetch(
        `https://www.pinterest.com/resource/BaseSearchResource/get/?data=${encodeURIComponent(JSON.stringify({ options: { query, scope: 'pins' }, context: {} }))}`,
        { headers: { Cookie: this.cookieHeader() } }
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      const pins = data?.resource_response?.data?.results || [];
      return pins.slice(0, limit).map((pin: any) => ({
        id: pin.id || '',
        text: pin.description || pin.title || '',
        author: pin.pinner?.username || '',
      }));
    } catch { return []; }
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    const resp = await this.req('/PinCommentResource/create/', 'POST', {
      pin_id: postId,
      text,
    });
    return { success: resp.ok };
  }

  async like(postId: string): Promise<ActionResult> {
    // Pinterest has "save" not "like"
    return { success: false, error: 'Pinterest does not have a like action' };
  }

  async getMentions(): Promise<Mention[]> { return []; }
  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }
}
