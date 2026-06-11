/**
 * Threads client — browser automation via Playwright.
 * Uses threads.net login (Instagram credentials).
 * No API keys needed.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

export class ThreadsClient extends BasePlatformClient {
  constructor() { super('threads'); }

  async login(username: string, password: string): Promise<SessionData> {
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
      await page.goto('https://www.threads.net/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      // Take screenshot for debugging
      await page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\threads_debug.png', fullPage: true }).catch(() => {});
      
      // Try multiple selectors for username input
      const usernameSelectors = [
        'input[aria-label="Phone number, username, or email"]',
        'input[autocomplete="username"]',
        'input[name="username"]',
        'input[type="text"]',
        'input[placeholder*="Mobile number"]',
        'input[placeholder*="username"]',
        'input[placeholder*="email"]',
      ];
      let usernameInput = null;
      for (const sel of usernameSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          usernameInput = sel;
          break;
        } catch { /* try next */ }
      }
      if (!usernameInput) {
        throw new Error('Threads login: could not find username input field');
      }
      await page.fill(usernameInput, username);
      await page.waitForTimeout(300);

      // Try multiple selectors for password input
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
      ];
      let passwordInput = null;
      for (const sel of passwordSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          passwordInput = sel;
          break;
        } catch { /* try next */ }
      }
      if (!passwordInput) {
        throw new Error('Threads login: could not find password input field');
      }
      await page.fill(passwordInput, password);
      await page.waitForTimeout(300);

      // Try pressing Enter first, then try button selectors
      let submitBtn = null;
      try {
        await page.getByRole('button', { name: 'Log in' }).first().waitFor({ timeout: 5000 });
        submitBtn = page.getByRole('button', { name: 'Log in' }).first();
      } catch { /* try next */ }
      
      if (!submitBtn) {
        const submitSelectors = [
          'button[type="submit"]',
          'button:has-text("Log in")',
          'button:has-text("Log In")',
        ];
        for (const sel of submitSelectors) {
          try {
            await page.waitForSelector(sel, { timeout: 5000 });
            submitBtn = sel;
            break;
          } catch { /* try next */ }
        }
      }
      
      if (submitBtn) {
        if (typeof submitBtn === 'string') {
          await page.click(submitBtn);
        } else {
          await submitBtn.click();
        }
      } else {
        // Fallback: press Enter on password field
        await page.press(passwordInput, 'Enter');
      }

      // Wait for redirect away from login page with longer timeout
      try {
        await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 60000 });
      } catch {
        // Take screenshot to debug
        await page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\threads_after_login.png', fullPage: true }).catch(() => {});
        const currentUrl = page.url();
        
        // Handle "Save your login info?" or security screens
        if (currentUrl.includes('/accounts/onetap') || currentUrl.includes('/challenge') || currentUrl.includes('/security')) {
          const skipBtn = await page.$('button:has-text("Not now"), button:has-text("Skip"), [role="button"]:has-text("Not now")').catch((): null => null);
          if (skipBtn) {
            await skipBtn.click();
            await page.waitForTimeout(2000);
          } else if (currentUrl.includes('/challenge') || currentUrl.includes('/security')) {
            throw new Error('Threads login: security challenge detected. Please log in manually via browser to verify your account.');
          }
        }
        
        // Check if we have session cookies anyway
        const cookies = await ctx.cookies();
        const cookieMap: Record<string, string> = {};
        for (const c of cookies) cookieMap[c.name] = c.value;
        const sessionCookie = cookieMap['sessionid'] || cookieMap['ig_did'];
        
        if (!sessionCookie) {
          throw new Error(`Threads login timed out at ${currentUrl}. Please check credentials and try again.`);
        }
        
        // Navigate to home to confirm we're logged in
        await page.goto('https://www.threads.net/', { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(2000);
      }

      await page.waitForTimeout(2000);

      const cookies = await ctx.cookies();
      const cookieMap: Record<string, string> = {};
      for (const c of cookies) cookieMap[c.name] = c.value;

      const session: SessionData = {
        token: cookieMap['sessionid'] || cookieMap['ig_did'] || '',
        cookies: cookieMap,
        extra: { username },
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      this.session = session;
      return session;
    } finally {
      await browser.close();
    }
  }

  async post(text: string): Promise<ActionResult> {
    // Threads uses Instagram-backed API
    const token = this.session?.token;
    if (!token) return { success: false, error: 'Not logged in' };

    try {
      // Use Threads web API
      const resp = await fetch('https://www.threads.net/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': this.cookieHeader(),
          'X-IG-App-ID': '238260118697367',
        },
        body: new URLSearchParams({
          doc_id: '7673149799375849',
          variables: JSON.stringify({ text }),
        }),
      });
      if (resp.ok) return { success: true };
      return { success: false, error: `${resp.status}` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    // Use browser to search for threads
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    
    // Inject cookies
    if (this.session?.cookies) {
      const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
        name,
        value,
        domain: '.threads.net',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax' as const,
      }));
      await ctx.addCookies(cookies);
    }
    
    try {
      await page.goto(`https://www.threads.net/search?q=${encodeURIComponent(query)}`, { 
        waitUntil: 'load', 
        timeout: 60000 
      });
      await page.waitForTimeout(3000);

      // Try multiple selectors — Threads frequently changes its DOM
      const selectorStrategies = [
        '[data-pressable-container="true"] a[href*="/post/"]',
        '[data-pressable-container="true"] a[href*="/t/"]',
        'a[href*="/post/"]',
        'a[href*="/t/"]',
        'article a[role="link"]',
      ];

      let threads: SearchResult[] = [];
      const maxResults = limit || 10;
      for (const selector of selectorStrategies) {
        try {
          threads = await page.$$eval(selector, (els: any[], lim: number) =>
            els.slice(0, lim).map((el: any, index: number) => {
              const href = el.getAttribute('href') || '';
              const parts = href.split('/').filter(Boolean);
              let id = parts.pop() || `thread_${index}`;
              if (/^(media|replies|liked|repost|@)/i.test(id) && parts.length > 0) {
                id = parts.pop() || id;
              }
              const container = el.closest('[data-pressable-container="true"]');
              const textContent = container?.textContent?.trim()?.slice(0, 200) || '';
              return {
                id,
                text: textContent,
                author: '',
                extra: { href: href.startsWith('http') ? href : `https://www.threads.net${href}` },
              };
            }),
          maxResults);
          if (threads.length > 0) break;
        } catch { /* try next strategy */ }
      }
      // Fallback: if search returned no results, grab posts from main feed
      if (threads.length === 0) {
        try {
          await page.goto('https://www.threads.net', { waitUntil: 'load', timeout: 30000 });
          await page.waitForTimeout(4000);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(1000);
          const feedResults = await page.$$eval('a[href*="/post/"], a[href*="/t/"]', (els: any[], lim: number) =>
            els.slice(0, lim).map((el: any, i: number) => {
              const href = el.getAttribute('href') || '';
              const parts = href.split('/').filter(Boolean);
              let id = parts.pop() || `feed_${i}`;
              if (/^(media|replies|liked|repost|@)/i.test(id) && parts.length > 0) {
                id = parts.pop() || id;
              }
              return { id, text: '', author: '', extra: { href: href.startsWith('http') ? href : `https://www.threads.net${href}` } };
            }),
          limit);
          threads.push(...feedResults);
        } catch {}
      }

      return threads.length > 0 ? threads.slice(0, limit) : threads;
    } catch (err: any) {
      return [];
    } finally {
      await browser.close();
    }
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    // Use browser to comment on a thread
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    
    // Inject cookies
    if (this.session?.cookies) {
      const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
        name,
        value,
        domain: '.threads.net',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax' as const,
      }));
      await ctx.addCookies(cookies);
    }
    
    try {
      const postUrl = postId.startsWith('http') ? postId : `https://www.threads.net/t/${postId}`;
      await page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(5000);

      // Click Reply text — this should open the comment box at the bottom
      const replySpan = await page.$('span:has-text("Reply")');
      if (replySpan) {
        await replySpan.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
      } else {
        // Fallback: try clicking the very bottom of the page
        await page.click('body', { position: { x: 300, y: 700 }, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }

      // After clicking Reply, try typing text directly into whatever has focus
      await page.keyboard.type(text, { delay: 50 });
      await page.waitForTimeout(1000);

      // Click Post button or press Enter
      const postBtn = await page.$('div[role="button"]:has-text("Post")');
      if (postBtn) {
        await postBtn.click({ timeout: 5000 });
      } else {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(3000);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close();
    }
  }

  async like(postId: string): Promise<ActionResult> {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    if (this.session?.cookies) {
      const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
        name, value, domain: '.threads.net', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' as const,
      }));
      await ctx.addCookies(cookies);
    }
    try {
      const postUrl = postId.startsWith('http') ? postId : `https://www.threads.net/t/${postId}`;
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

      const clicked = await page.evaluate((): boolean => {
        const all = Array.from(document.querySelectorAll(
          'svg[aria-label="Like"], svg[aria-label="Unlike"], div[role="button"][tabindex="0"]'
        ));
        for (const el of all) {
          const label = el.getAttribute('aria-label') || '';
          const html = (el as HTMLElement).tagName.toLowerCase();
          if (label === 'Like' || label === 'Unlike') {
            const btn = el.closest('div[role="button"]') || el.closest('button') || el;
            (btn as HTMLElement).click();
            return true;
          }
          if (html === 'div' && el.closest('article')) {
            const inner = el.querySelector('svg[aria-label="Like"], svg[aria-label="Unlike"]');
            if (inner) { (el as HTMLElement).click(); return true; }
          }
        }
        return false;
      });

      if (!clicked) return { success: false, error: 'Threads: Could not find like button' };
      await page.waitForTimeout(2000);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close();
    }
  }

  async getMentions(limit = 20): Promise<Mention[]> {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    if (this.session?.cookies) {
      const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
        name, value, domain: '.threads.net', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' as const,
      }));
      await ctx.addCookies(cookies);
    }
    const page = await ctx.newPage();
    try {
      await page.goto('https://www.threads.net/activity', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      const mentions: Mention[] = await page.evaluate((lim: number) => {
        const items = document.querySelectorAll('[role="listitem"], [data-pressable-container="true"], article');
        const results: any[] = [];
        items.forEach((item) => {
          if (results.length >= lim) return;
          const text = item.textContent?.trim() || '';
          if (text.includes('mentioned') || text.includes('replied') || text.includes('tagged')) {
            const link = item.querySelector('a[href*="/post/"], a[href*="/t/"]');
            const href = link?.getAttribute('href') || '';
            const id = href.split('/').filter(Boolean).pop() || `mention_${results.length}`;
            const authorLink = item.querySelector('a[href^="/@"]');
            const author = authorLink?.textContent?.trim() || '';
            results.push({ id, text: text.slice(0, 300), author });
          }
        });
        return results;
      }, limit);
      return mentions;
    } catch {
      return [];
    } finally {
      await browser.close();
    }
  }

  override async repost(postId: string): Promise<ActionResult> {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    if (this.session?.cookies) {
      const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
        name, value, domain: '.threads.net', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' as const,
      }));
      await ctx.addCookies(cookies);
    }
    const page = await ctx.newPage();
    try {
      const postUrl = postId.startsWith('http') ? postId : `https://www.threads.net/t/${postId}`;
      await page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Find and click the repost button
      const repostSelectors = [
        'svg[aria-label="Repost"]',
        '[aria-label="Repost"]',
        'div[role="button"] svg[aria-label="Repost"]',
      ];
      let repostBtn = null;
      for (const sel of repostSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          repostBtn = sel;
          break;
        } catch { /* try next */ }
      }
      if (!repostBtn) {
        return { success: false, error: 'Threads: repost button not found' };
      }
      await page.click(repostBtn);
      await page.waitForTimeout(1500);

      // Click "Repost" in the popup (not "Quote")
      const confirmBtn = await page.$('button:has-text("Repost"), div[role="button"]:has-text("Repost"), [role="menuitem"]:has-text("Repost")').catch((): null => null);
      if (confirmBtn) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      await browser.close();
    }
  }

  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }

  private cookieHeader(): string {
    return Object.entries(this.session?.cookies || {}).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}
