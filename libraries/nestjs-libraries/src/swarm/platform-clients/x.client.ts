/**
 * X (Twitter) client — browser login (Playwright) + cookie-based REST API.
 * Supports username/password login. No API keys required.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

const BASE = 'https://x.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class XClient extends BasePlatformClient {
  constructor() {
    super('x');
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<SessionData> {
    const { page, browser } = await this.openBrowser();
    try {
      await page.goto('https://x.com/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(4000);

      // Handle onboarding redirect — X sometimes sends to /i/jf/onboarding/web
      const currentUrl = page.url();
      if (currentUrl.includes('/onboarding') || currentUrl.includes('/jf/')) {
        await page.goto('https://x.com/', { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(4000);
      }

      const url = page.url();
      const html = await page.content();
      console.log(`X login page loaded: ${url}`);
      console.log(`HTML snippet: ${html.slice(0, 500)}`);

      // Enter username
      const usernameInput = await this.findInput(page, [
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[name="username_or_email"]',
        'input[autocomplete="email"]',
        'input[type="text"]',
        'input[placeholder*="Username"]',
        'input[placeholder*="Phone"]',
        'input[placeholder*="Email"]',
      ]);
      if (!usernameInput) {
        console.log(`X login page HTML: ${html.slice(0, 1000)}`);
        throw new Error(`X: username field not found on login page. URL: ${url}`);
      }
      await usernameInput.focus();
      await page.waitForTimeout(300);
      await usernameInput.fill(username);
      await page.waitForTimeout(300);

      // Click Next
      await page.waitForTimeout(500);
      const nextBtn = await page.$('button:has-text("Next"), button[type="submit"], [role="button"]:has-text("Next")');
      console.log(`X next button found: ${!!nextBtn}`);
      if (nextBtn) {
        await nextBtn.click();
        console.log('X next button clicked');
      } else {
        await usernameInput.press('Enter');
        console.log('X username Enter pressed');
      }
      await page.waitForTimeout(500);

      await page.waitForTimeout(2000);

      // Enter password
      const passwordInput = await this.findInput(page, [
        'input[name="password"]',
        'input[type="password"]',
        'input[autocomplete="current-password"]',
        'input[placeholder*="Password"]',
      ]);
      if (!passwordInput) throw new Error('X: password field not found on login page');
      await passwordInput.focus();
      await page.waitForTimeout(300);
      await passwordInput.fill(password);
      await page.waitForTimeout(300);

      // Click Log in
      await page.waitForTimeout(500);
      const loginBtn = await page.$('button:has-text("Log in"), button[type="submit"], [role="button"]:has-text("Log in")');
      console.log(`X login button found: ${!!loginBtn}`);
      if (loginBtn) {
        await loginBtn.click();
        console.log('X login button clicked');
      } else {
        await passwordInput.press('Enter');
        console.log('X password Enter pressed');
      }
      await page.waitForTimeout(500);

      // Wait for navigation away from login
      await page.waitForTimeout(3000);
      try {
        await page.waitForFunction(
          () => !window.location.href.includes('/login') && !window.location.href.includes('/onboarding'),
          { timeout: 45000, polling: 1000 },
        );
      } catch {
        const currentUrl = page.url();
        console.log(`X landed at: ${currentUrl}`);
        
        // Handle onboarding / phone signup / challenge pages
        if (
          currentUrl.includes('/onboarding') ||
          currentUrl.includes('/signup_phone') ||
          currentUrl.includes('/challenge') ||
          currentUrl.includes('/account/access')
        ) {
          console.log(`X: post-login landing page is ${currentUrl}, attempting to skip...`);
          
          // Try clicking Skip / Not now
          const skipSelectors = [
            'text=Skip',
            'text=Skip for now',
            'text=Not now',
            'text=Next',
            '[role="button"]:has-text("Skip")',
            '[role="button"]:has-text("Not now")',
            '[role="button"]:has-text("Next")',
            'button:has-text("Skip")',
            'button:has-text("Not now")',
          ];
          for (const sel of skipSelectors) {
            try {
              const btn = await page.$(sel);
              if (btn) {
                await btn.click();
                console.log(`X: clicked "${sel}"`);
                await page.waitForTimeout(2000);
              }
            } catch {}
          }
          
          // Navigate to home to see if we're logged in
          await page.goto('https://x.com/home', { waitUntil: 'load', timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(3000);
          
          // Check if we're actually on home now
          const afterUrl = page.url();
          if (afterUrl.includes('/home') || afterUrl === 'https://x.com/home') {
            console.log('X: successfully navigated to home after onboarding skip');
          } else if (afterUrl.includes('/login')) {
            throw new Error('X login failed: redirected back to login after onboarding attempt');
          } else {
            throw new Error(`X account needs manual verification. Landed at: ${afterUrl}. Please complete phone/email verification on x.com first.`);
          }
        } else {
          const screenshotPath = `D:\\Prospektlab-bot\\postiz-app\\x_login_debug.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
          const html = await page.content();
          console.log(`X login timeout at ${currentUrl}, html=${html.slice(0, 1000)}`);
          const errText = await page.textContent('[data-testid="toast"], .toast, [role="alert"], .error, [data-testid="primaryColumn"]').catch(() => '');
          if (errText) throw new Error(`X login failed: ${errText}`);
          throw new Error(`X login timed out at ${currentUrl}`);
        }
      }

      await page.waitForTimeout(2000);
      const finalUrl = page.url();
      console.log(`X final URL after login: ${finalUrl}`);

      // Collect cookies
      const rawCookies = await page.context().cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of rawCookies) {
        if (c.domain.includes('x.com') || c.domain.includes('twitter.com')) {
          cookieMap[c.name] = c.value;
        }
      }

      console.log('X cookies after login:', JSON.stringify(cookieMap));
      console.log('X raw cookies:', rawCookies.map((c: any) => `${c.name}=${c.domain}`).join(', '));

      // Check if we got auth cookies
      const hasAuth = !!cookieMap['auth_token'] || !!cookieMap['ct0'] || !!cookieMap['twid'];
      if (!hasAuth) {
        // Take a screenshot for debugging
        const screenshotPath = `D:\\Prospektlab-bot\\postiz-app\\x_login_debug.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        console.log(`X login screenshot saved to ${screenshotPath}`);
        
        const pageText = await page.textContent('body').catch(() => '');
        if (pageText.includes('Sign in') || pageText.includes('Log in') || pageText.includes('Create account')) {
          throw new Error('X login failed: still on login page after submission');
        }
        // If no auth cookies but not on login page, might be logged in via other mechanism
      }

      const token = cookieMap['auth_token'] || cookieMap['ct0'] || cookieMap['twid'] || cookieMap['guest_id'] || '';

      const session: SessionData = {
        token,
        cookies: cookieMap,
        extra: { ct0: cookieMap['ct0'], username },
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
    const { page, browser } = await this.openBrowser();
    try {
      await this.injectCookies(page);
      await page.goto(`${BASE}/compose/post`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(2000);

      const input = await page.$('[data-testid="tweetTextarea_0"], div[contenteditable="true"]');
      if (!input) {
        return { success: false, error: 'Tweet input not found' };
      }
      await input.click();
      await page.waitForTimeout(300);
      await input.fill(text);
      await page.waitForTimeout(300);

      const postBtn = await page.$('[data-testid="tweetButton"], button:has-text("Post")');
      if (!postBtn) {
        return { success: false, error: 'Post button not found' };
      }
      await postBtn.click();
      await page.waitForTimeout(3000);

      // Try to get the tweet URL from the page
      const url = page.url();
      return { success: true, id: url, data: { url } };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  async searchPosts(query: string, limit = 10, _subreddit?: string): Promise<SearchResult[]> {
    const { page, browser } = await this.openBrowser();
    try {
      await this.injectCookies(page);
      const encodedQuery = encodeURIComponent(query);
      await page.goto(`${BASE}/search?q=${encodedQuery}&f=live`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      const tweets = await page.$$('[data-testid="tweet"]');
      const results: SearchResult[] = [];
      for (let i = 0; i < Math.min(tweets.length, limit); i++) {
        const tweet = tweets[i];
        const textEl = await tweet.$('[data-testid="tweetText"]');
        const text = textEl ? await textEl.textContent() : '';
        const linkEl = await tweet.$('a[href*="/status/"]');
        const href = linkEl ? await linkEl.getAttribute('href') : '';
        const id = href.split('/status/')[1]?.split('?')[0] || '';
        const authorEl = await tweet.$('[data-testid="User-Name"] a');
        const author = authorEl ? await authorEl.getAttribute('href') : '';
        results.push({
          id,
          text: text || '',
          author: author.replace('/', '') || '',
          extra: { href },
        });
      }
      return results;
    } catch {
      return [];
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── Comment (reply) ───────────────────────────────────────────────────────

  async comment(postId: string, text: string): Promise<ActionResult> {
    const { page, browser } = await this.openBrowser();
    try {
      await this.injectCookies(page);
      await page.goto(`${BASE}/i/web/status/${postId}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(2000);

      const replyBtn = await page.$('[data-testid="reply"], button:has-text("Reply")');
      if (!replyBtn) {
        return { success: false, error: 'Reply button not found' };
      }
      await replyBtn.click();
      await page.waitForTimeout(1000);

      const input = await page.$('[data-testid="tweetTextarea_0"], div[contenteditable="true"]');
      if (!input) {
        return { success: false, error: 'Reply input not found' };
      }
      await input.click();
      await page.waitForTimeout(300);
      await input.fill(text);
      await page.waitForTimeout(300);

      const postBtn = await page.$('[data-testid="tweetButton"], button:has-text("Reply")');
      if (!postBtn) {
        return { success: false, error: 'Post reply button not found' };
      }
      await postBtn.click();
      await page.waitForTimeout(3000);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── Like ────────────────────────────────────────────────────────────────────

  async like(postId: string): Promise<ActionResult> {
    const { page, browser } = await this.openBrowser();
    try {
      await this.injectCookies(page);
      await page.goto(`${BASE}/i/web/status/${postId}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(2000);

      const likeBtn = await page.$('[data-testid="like"], button:has-text("Like")');
      if (!likeBtn) {
        return { success: false, error: 'Like button not found' };
      }
      await likeBtn.click();
      await page.waitForTimeout(1000);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // ─── Mentions ───────────────────────────────────────────────────────────────

  async getMentions(limit = 20): Promise<Mention[]> {
    const username = this.session?.extra?.username || '';
    if (!username) return [];
    const results = await this.searchPosts(`@${username}`, limit);
    return results.map((r) => ({ id: r.id, text: r.text, author: r.author, extra: r.extra }));
  }

  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }

  override async repost(postId: string): Promise<ActionResult> {
    const { page, browser } = await this.openBrowser();
    try {
      await this.injectCookies(page);
      await page.goto(`${BASE}/i/web/status/${postId}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(2000);

      const retweetBtn = await page.$('[data-testid="retweet"], button:has-text("Retweet")');
      if (!retweetBtn) {
        return { success: false, error: 'Retweet button not found' };
      }
      await retweetBtn.click();
      await page.waitForTimeout(1000);

      const confirmBtn = await page.$('[data-testid="retweetConfirm"], button:has-text("Retweet")');
      if (confirmBtn) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1000);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close().catch(() => {});
    }
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

  private async injectCookies(page: any) {
    if (!this.session?.cookies) return;
    const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
      name,
      value,
      domain: '.x.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
    }));
    await page.context().addCookies(cookies);
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
