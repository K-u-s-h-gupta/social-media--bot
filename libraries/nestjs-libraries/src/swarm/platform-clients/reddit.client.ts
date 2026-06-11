/**
 * Reddit client — browser login (Playwright) + cookie-based REST API.
 * Supports username/password login. No app registration needed.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

const BASE = 'https://www.reddit.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class RedditClient extends BasePlatformClient {
  constructor() {
    super('reddit');
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<SessionData> {
    const { page, browser } = await this.openBrowser();
    try {
      // Use 'load' — Reddit SPA never reaches 'networkidle'
      await page.goto(`${BASE}/login/`, {
        waitUntil: 'load',
        timeout: 60000,
      });

      // Wait a couple seconds for the SPA to hydrate
      await page.waitForTimeout(2500);

      // Try multiple selector patterns Reddit uses
      const usernameInput = await this.findInput(page, [
        'input[name="username"]',
        'input[id="login-username"]',
        'input[id="loginUsername"]',
        'faceplate-text-input[name="username"] input',
        'auth-flow-modal input[name="username"]',
        'input[autocomplete="username"]',
      ]);
      if (!usernameInput) throw new Error('Reddit: username field not found on login page');

      const passwordInput = await this.findInput(page, [
        'input[name="password"]',
        'input[id="login-password"]',
        'input[id="loginPassword"]',
        'faceplate-text-input[name="password"] input',
        'auth-flow-modal input[name="password"]',
        'input[type="password"]',
      ]);
      if (!passwordInput) throw new Error('Reddit: password field not found on login page');

      // Fill credentials
      await usernameInput.click();
      await page.waitForTimeout(300);
      await usernameInput.fill(username);
      await page.waitForTimeout(300);
      await passwordInput.click();
      await page.waitForTimeout(300);
      await passwordInput.fill(password);
      await page.waitForTimeout(500);

      // Submit
      const submitBtn = await this.findInput(page, [
        'button[type="submit"]',
        'auth-flow-modal button[type="submit"]',
        'button:text("Log In")',
        'button:text("Log in")',
        'button:text("Continue")',
      ]);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await passwordInput.press('Enter');
      }

      // Wait for successful navigation away from /login
      await page.waitForFunction(
        () => !window.location.href.includes('/login'),
        { timeout: 45000, polling: 1000 },
      ).catch(async () => {
        // Check for error messages
        const errText = await page.textContent('[id*="error"], .error-message, [class*="error"]').catch(() => '');
        throw new Error(`Reddit login failed: ${errText || 'timed out — check credentials'}`);
      });

      await page.waitForTimeout(2000);

      // Extract modhash for CSRF
      const meData = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/me.json', { credentials: 'include' });
          return r.json();
        } catch { return {}; }
      }).catch(() => ({})) as any;
      const modhash: string = meData?.data?.modhash || '';
      const loggedInUser: string = meData?.data?.name || username;

      // Collect all reddit.com cookies
      const rawCookies = await page.context().cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of rawCookies) {
        if (c.domain.includes('reddit.com')) cookieMap[c.name] = c.value;
      }

      // Accept any of these auth tokens
      const token =
        cookieMap['reddit_session'] ||
        cookieMap['token_v2'] ||
        cookieMap['session'] ||
        modhash;
      if (!token) {
        throw new Error('Reddit: login appeared to succeed but no auth token found — verify your username/password');
      }

      const session: SessionData = {
        token,
        cookies: cookieMap,
        extra: { modhash, username: loggedInUser },
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      this.session = session;
      return session;
    } finally {
      await browser.close().catch(() => {});
    }
  }

  override restoreSession(session: SessionData): void {
    this.session = session;
  }

  // ─── Post ───────────────────────────────────────────────────────────────────

  async post(text: string): Promise<ActionResult> {
    // Try to extract subreddit hint from text (e.g. "r/stocks: ...")
    const subredditMatch = text.match(/\br\/([A-Za-z0-9_]+)\b/);
    const subreddit = subredditMatch
      ? subredditMatch[1]
      : `u_${this.session?.extra?.username || 'test'}`;  // personal profile subreddit as fallback

    // Clean text: remove "r/xxx:" prefix if present
    const cleanText = text.replace(/^r\/\w+:\s*/, '').trim() || text;

    // Title = first sentence / first 300 chars
    const title = cleanText.split(/[.!\n]/)[0].slice(0, 300) || cleanText.slice(0, 300);
    const body = cleanText.length > 300 ? cleanText : '';

    const resp = await this.req('/api/submit', 'POST', {
      sr: subreddit,
      kind: 'self',
      title,
      text: body,
      resubmit: 'true',
      nsfw: 'false',
      api_type: 'json',
    });

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '');
      return { success: false, error: `HTTP ${resp.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await resp.json() as any;
    if (data?.json?.errors?.length) {
      return { success: false, error: data.json.errors.map((e: any) => e[1]).join(', ') };
    }
    const id = data?.json?.data?.id;
    return { success: !!id, id, data: { url: data?.json?.data?.url } };
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    const url = subreddit
      ? `/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 25)}&sort=new&type=link,self&restrict_sr=on`
      : `/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 25)}&sort=new&type=link,self`;
    const resp = await this.req(url);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data?.data?.children || []).slice(0, limit).map((c: any) => ({
      id: c.data.name,
      text: `${c.data.title} ${c.data.selftext || ''}`.trim().slice(0, 500),
      author: c.data.author,
      authorId: c.data.author,
      extra: {
        subreddit: c.data.subreddit,
        permalink: c.data.permalink,
        name: c.data.name,
        score: c.data.score,
      },
    }));
  }

  // ─── Comment ────────────────────────────────────────────────────────────────

  async comment(postId: string, text: string): Promise<ActionResult> {
    // postId should be "t3_xxxxx" format (link post) or "t1_xxxxx" (comment)
    const thingId = postId.includes('_') ? postId : `t3_${postId}`;
    const resp = await this.req('/api/comment', 'POST', {
      thing_id: thingId,
      text,
      api_type: 'json',
    });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    const data = await resp.json() as any;
    if (data?.json?.errors?.length) {
      return { success: false, error: data.json.errors.map((e: any) => e[1]).join(', ') };
    }
    return { success: true, id: data?.json?.data?.things?.[0]?.data?.id };
  }

  // ─── Like (upvote) ──────────────────────────────────────────────────────────

  async like(postId: string): Promise<ActionResult> {
    const thingId = postId.includes('_') ? postId : `t3_${postId}`;
    const resp = await this.req('/api/vote', 'POST', { id: thingId, dir: '1' });
    return { success: resp.ok, error: resp.ok ? undefined : `HTTP ${resp.status}` };
  }

  // ─── Mentions ───────────────────────────────────────────────────────────────

  async getMentions(limit = 25): Promise<Mention[]> {
    const resp = await this.req(`/message/mentions.json?limit=${Math.min(limit, 25)}&mark=false`);
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data?.data?.children || []).map((c: any) => ({
      id: c.data.name,
      text: c.data.body || c.data.subject || '',
      author: c.data.author,
      extra: { context: c.data.context, subreddit: c.data.subreddit },
    }));
  }

  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }

  // ─── Repost (crosspost) ────────────────────────────────────────────────────

  override async repost(postId: string, extra?: any): Promise<ActionResult> {
    const thingId = postId.includes('_') ? postId : `t3_${postId}`;
    const targetSub = extra?.subreddit || `u_${this.session?.extra?.username || 'me'}`;
    const resp = await this.req('/api/crosspost', 'POST', {
      thing_id: thingId,
      sr: targetSub,
      kind: 'crosspost',
      api_type: 'json',
      resubmit: 'true',
      title: extra?.title || 'Crosspost',
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { success: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }
    const data = await resp.json() as any;
    if (data?.json?.errors?.length) {
      return { success: false, error: data.json.errors.map((e: any) => e[1]).join(', ') };
    }
    return { success: true, id: data?.json?.data?.id };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async findInput(page: any, selectors: string[]): Promise<any | null> {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) return el;
      } catch { /* try next */ }
    }
    return null;
  }

  private async req(
    path: string,
    method = 'GET',
    body?: Record<string, string>,
  ): Promise<Response> {
    if (!this.session?.cookies) {
      throw new Error('Reddit: not logged in — session missing');
    }
    const cookieStr = Object.entries(this.session.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    const headers: Record<string, string> = {
      Cookie: cookieStr,
      'User-Agent': UA,
      Accept: 'application/json',
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['X-Modhash'] = this.session?.extra?.modhash || '';
    }
    const init: RequestInit = { method, headers };
    if (body && method === 'POST') init.body = new URLSearchParams(body).toString();
    return fetch(`${BASE}${path}`, init);
  }

  private async openBrowser(): Promise<{ page: any; browser: any }> {
    const playwright = require('playwright');
    const browser = await playwright.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
      ],
    });
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    await context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    `);
    const page = await context.newPage();
    return { page, browser };
  }
}
