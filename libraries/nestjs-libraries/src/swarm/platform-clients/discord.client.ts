/**
 * Discord client — uses Discord's web API directly with user token.
 * Login via browser to extract the user token, then use REST API.
 * Note: Automating user accounts violates Discord ToS — use a bot token for production.
 * For username/password access (as requested), browser extraction is used.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

export class DiscordClient extends BasePlatformClient {
  private userToken = '';

  constructor() { super('discord'); }

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

    let extractedToken = '';
    // Intercept network requests to capture the auth token
    page.on('request', (req: any) => {
      const auth = req.headers()['authorization'];
      if (auth && !auth.startsWith('Bot ') && auth.length > 30) {
        extractedToken = auth;
      }
    });

    try {
      await page.goto('https://discord.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('input[name="email"]', { timeout: 15000 });
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');
      // Wait for main app to load
      await page.waitForURL('**/channels/**', { timeout: 30000 });
      await page.waitForTimeout(2000);

      if (!extractedToken) {
        // Try to extract from localStorage
        extractedToken = await page.evaluate(() => {
          const iframe = document.createElement('iframe');
          document.body.appendChild(iframe);
          const storage = (iframe.contentWindow as any)?.localStorage;
          return storage ? JSON.parse(storage.getItem('token') || '""') : '';
        }).catch(() => '');
      }

      const session: SessionData = {
        token: extractedToken,
        extra: { email },
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      this.session = session;
      this.userToken = extractedToken;
      return session;
    } finally {
      await browser.close();
    }
  }

  override restoreSession(session: SessionData): void {
    super.restoreSession(session);
    this.userToken = session.token;
  }

  private async req(path: string, method = 'GET', body?: any): Promise<Response> {
    return fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        'Authorization': this.userToken,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  async post(text: string, channelId?: string): Promise<ActionResult> {
    const targetChannel = channelId || this.session?.extra?.defaultChannelId;
    if (!targetChannel) return { success: false, error: 'No channel ID specified. Set defaultChannelId in platformConfig.' };
    const resp = await this.req(`/channels/${targetChannel}/messages`, 'POST', { content: text });
    if (!resp.ok) return { success: false, error: `${resp.status}` };
    const data = await resp.json() as any;
    return { success: true, id: data.id };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    return []; // Discord search requires admin or specific permissions
  }

  async comment(postId: string, text: string, extra?: any): Promise<ActionResult> {
    const channelId = extra?.channelId || this.session?.extra?.defaultChannelId;
    if (!channelId) return { success: false, error: 'No channel ID' };
    const resp = await this.req(`/channels/${channelId}/messages`, 'POST', {
      content: text,
      message_reference: { message_id: postId },
    });
    return { success: resp.ok };
  }

  async like(postId: string, extra?: any): Promise<ActionResult> {
    const channelId = extra?.channelId;
    if (!channelId) return { success: false, error: 'No channel ID for reaction' };
    const resp = await this.req(`/channels/${channelId}/messages/${postId}/reactions/👍/@me`, 'PUT');
    return { success: resp.ok };
  }

  async getMentions(): Promise<Mention[]> { return []; }
  async reply(mentionId: string, text: string, extra?: any): Promise<ActionResult> {
    return this.comment(mentionId, text, extra);
  }
}
