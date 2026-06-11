/**
 * Medium client — browser automation via Playwright for login,
 * then uses Medium's unofficial API with the session token.
 * No API keys needed — just email + password.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

export class MediumClient extends BasePlatformClient {
  constructor() { super('medium'); }

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
      // Medium login with email
      await page.goto('https://medium.com/m/signin', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Click "Sign in with email"
      const emailBtn = page.locator('text=Sign in with email').first();
      if (await emailBtn.isVisible()) {
        await emailBtn.click();
        await page.waitForTimeout(1000);
      }

      await page.fill('input[type="email"], input[name="email"]', email);
      const continueBtn = page.locator('button:has-text("Continue")').first();
      if (await continueBtn.isVisible()) {
        await continueBtn.click();
        await page.waitForTimeout(1000);
      }

      const passField = page.locator('input[type="password"]');
      if (await passField.isVisible()) {
        await passField.fill(password);
        await page.click('button[type="submit"]');
      }

      await page.waitForFunction(() => !window.location.href.includes('/signin'), { timeout: 30000 });
      await page.waitForTimeout(2000);

      const cookies = await ctx.cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) cookieMap[c.name] = c.value;

      // Get user info
      const uid = cookieMap['uid'] || '';

      const session: SessionData = {
        token: cookieMap['sid'] || '',
        cookies: cookieMap,
        extra: { uid, email },
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
    return fetch(`https://medium.com${path}`, {
      method,
      headers: {
        'Cookie': this.cookieHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  async post(text: string): Promise<ActionResult> {
    // Medium draft creation via unofficial API
    try {
      const resp = await this.req('/_/api/posts', 'POST', {
        title: text.split('\n')[0].slice(0, 100),
        content: { bodyModel: { paragraphs: [{ text, type: 1 }], sections: [{ startIndex: 0 }] } },
        contentFormat: 'markdown',
        publishedAt: Date.now(),
        license: 0,
        notifyFollowers: true,
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        return { success: true, id: data?.payload?.value?.id };
      }
      return { success: false, error: `${resp.status}` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    return [];
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    try {
      const resp = await this.req(`/_/api/posts/${postId}/responses`, 'POST', {
        content: { bodyModel: { paragraphs: [{ text, type: 1 }], sections: [{ startIndex: 0 }] } },
      });
      return { success: resp.ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async like(postId: string): Promise<ActionResult> {
    try {
      const resp = await this.req(`/_/api/posts/${postId}/votes`, 'POST', { votes: 50 });
      return { success: resp.ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getMentions(): Promise<Mention[]> { return []; }
  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }
}
