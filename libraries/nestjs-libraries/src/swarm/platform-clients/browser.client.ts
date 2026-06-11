/**
 * Browser-based client for platforms that need Playwright login:
 * LinkedIn, Instagram.
 *
 * Uses headless Chromium with anti-bot stealth settings.
 * Logs in once, stores cookies, reuses session for all actions via HTTP.
 *
 * KEY FIX: Never use waitUntil:'networkidle' — SPAs keep requests alive.
 * Always use 'load' + explicit waitForTimeout for SPA hydration.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class LinkedInClient extends BasePlatformClient {
  constructor() { super('linkedin'); }

  async login(email: string, password: string): Promise<SessionData> {
    const page = await this.openPage();
    try {
      // 'load' instead of 'networkidle' — LinkedIn SPA never reaches networkidle
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(2000);

      // LinkedIn periodically changes selectors; try multiple strategies
      const usernameSelectors = [
        '#username',
        'input[name="session_key"]',
        'input[autocomplete="username"]',
        'input[type="email"]',
        'input[type="text"]',
        'input[aria-label*="Email"]',
        'input[aria-label*="phone"]',
      ];
      // Wait for page to have inputs, then scroll down to ensure form is visible
      await page.waitForSelector('input', { timeout: 15000 }).catch(() => {});
      // Scroll down to make the email/password form visible
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(500);

      let usernameInput = null;
      for (const sel of usernameSelectors) {
        try {
          const el = await page.$(sel);
          if (el) { usernameInput = sel; break; }
        } catch { /* try next */ }
      }
      // Last resort: pick the first non-hidden, non-password input
      if (!usernameInput) {
        const firstInput = await page.$('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"])');
        if (firstInput) {
          usernameInput = 'input:not([type="hidden"]):not([type="password"]):not([type="checkbox"])';
        }
      }
      if (!usernameInput) {
        const url = page.url();
        await page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\linkedin_login_debug.png', fullPage: true }).catch(() => {});
        throw new Error(`LinkedIn: username field not found on login page. URL: ${url}`);
      }
      // Scroll element into view, focus it, and set value via JS (bypasses Playwright visibility check)
      await page.evaluate(({ sel, val }: { sel: string; val: string }) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { sel: usernameInput, val: email });
      await page.waitForTimeout(300);

      const passwordSelectors = ['#password', 'input[name="session_password"]', 'input[type="password"]'];
      let passwordInput = null;
      for (const sel of passwordSelectors) {
        try {
          const el = await page.$(sel);
          if (el) { passwordInput = sel; break; }
        } catch { /* try next */ }
      }
      if (!passwordInput) throw new Error('LinkedIn: password field not found on login page');
      await page.evaluate(({ sel, val }: { sel: string; val: string }) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, { sel: passwordInput, val: password });
      await page.waitForTimeout(300);

      // Find and click the correct Sign in button (not the social login ones)
      await page.evaluate((pwdSel: string) => {
        // Strategy 1: find the form containing the password field and submit it
        const pwdEl = document.querySelector(pwdSel);
        if (pwdEl) {
          const form = pwdEl.closest('form');
          if (form) {
            const btn = form.querySelector('[type="submit"], button') as HTMLElement;
            if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return; }
            form.submit();
            return;
          }
        }
        // Strategy 2: find a button whose text is exactly "Sign in" (not "Sign in with ...")
        const buttons = Array.from(document.querySelectorAll('button'));
        const exact = buttons.find((b) => {
          const t = (b.textContent || '').trim();
          return /^sign\s*in$/i.test(t) || /^log\s*in$/i.test(t);
        });
        if (exact) { exact.scrollIntoView({ block: 'center' }); exact.click(); return; }
        // Strategy 3: last resort form submit
        const form = document.querySelector('form');
        if (form) form.submit();
      }, passwordInput);

      // Wait for redirect to feed or profile
      await page.waitForURL(/linkedin\.com\/(feed|in\/)/, { timeout: 60000 }).catch(async () => {
        await page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\linkedin_after_submit.png', fullPage: true }).catch(() => {});
        const currentUrl = page.url();
        console.log(`LinkedIn after submit URL: ${currentUrl}`);
        const errText = await page.textContent('[data-test-id="error-for-username"], .alert-error, [role="alert"]').catch(() => '');
        throw new Error(`LinkedIn login failed at ${currentUrl}: ${errText || 'timed out — check credentials or CAPTCHA'}`);
      });

      await page.waitForTimeout(1500);
      return await this.extractCookies(page, 'li_at', 30 * 24 * 60 * 60 * 1000);
    } finally {
      await page.context().browser()?.close();
    }
  }

  async post(text: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(2500);

      // Try multiple "Start a post" button selectors
      const startPost = await this.findEl(page, [
        '[data-control-name="share.sharebox_create_post"]',
        'button:has-text("Start a post")',
        '.share-box-feed-entry__trigger',
        '[placeholder="What do you want to talk about?"]',
      ]);
      if (!startPost) throw new Error('LinkedIn: could not find "Start a post" button');
      await startPost.click();

      await page.waitForSelector('.ql-editor, [contenteditable="true"]', { timeout: 15000 });
      await page.waitForTimeout(500);

      const editor = await page.$('.ql-editor') || await page.$('[contenteditable="true"]');
      if (!editor) throw new Error('LinkedIn: text editor not found');
      await editor.click();
      await editor.fill(text);
      await page.waitForTimeout(500);

      // Submit the post
      const postBtn = await this.findEl(page, [
        'button.share-actions__primary-action',
        'button:has-text("Post")',
        '.share-box-footer__primary-btn',
      ]);
      if (!postBtn) throw new Error('LinkedIn: Post button not found');
      await postBtn.click();
      await page.waitForTimeout(2000);

      return { success: true };
    });
  }

  async searchPosts(query: string, limit = 5, subreddit?: string): Promise<SearchResult[]> {
    return this.browserAction(async (page: any) => {
      await page.goto(
        `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&sortBy=date_posted`,
        { waitUntil: 'load', timeout: 60000 },
      );
      await page.waitForTimeout(3000);

      const posts = await page.$$eval('.feed-shared-update-v2', (els: any[]) =>
        els.slice(0, 5).map((el) => ({
          id: el.getAttribute('data-urn') || Math.random().toString(),
          text: el.querySelector('.feed-shared-text')?.textContent?.trim() || '',
          author: el.querySelector('.update-components-actor__title')?.textContent?.trim() || '',
          extra: { urn: el.getAttribute('data-urn') },
        })),
      );
      return posts;
    }, []);
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      // postId can be a URN (urn:li:activity:123) or a raw activity ID
      const activityId = postId.includes(':') ? postId.split(':').pop() : postId;
      await page.goto(`https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`, {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      // Click the comment button to open the comment box
      const commentBtn = await this.findEl(page, [
        'button[aria-label*="Comment"]',
        'button[aria-label*="comment"]',
        '.comment-button',
        'button.social-actions-button:has(li-icon[type="comment"])',
      ]);
      if (commentBtn) {
        await commentBtn.click();
        await page.waitForTimeout(1500);
      }

      // Find and fill the comment input
      const commentInput = await this.findEl(page, [
        '.ql-editor[data-placeholder*="Add a comment"]',
        '.comments-comment-box__form .ql-editor',
        '[contenteditable="true"][role="textbox"]',
        '.ql-editor',
      ]);
      if (!commentInput) {
        return { success: false, error: 'LinkedIn: comment input not found' };
      }
      await commentInput.click();
      await page.waitForTimeout(300);
      await commentInput.fill(text);
      await page.waitForTimeout(500);

      // Submit the comment
      const submitBtn = await this.findEl(page, [
        'button.comments-comment-box__submit-button',
        'button[aria-label*="Post comment"]',
        'button:has-text("Post")',
        'form.comments-comment-box__form button[type="submit"]',
      ]);
      if (!submitBtn) {
        return { success: false, error: 'LinkedIn: comment submit button not found' };
      }
      await submitBtn.click();
      await page.waitForTimeout(2000);

      return { success: true };
    });
  }

  async like(postId: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      const activityId = postId.includes(':') ? postId.split(':').pop() : postId;
      await page.goto(`https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`, {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      // Find the Like button (not already liked)
      const likeBtn = await this.findEl(page, [
        'button[aria-label*="Like"]:not([aria-pressed="true"])',
        'button.react-button__trigger[aria-label*="Like"]',
        'button[aria-label*="like"]:not([aria-pressed="true"])',
        '.social-actions-button:has(li-icon[type="thumbs-up"])',
      ]);
      if (!likeBtn) {
        return { success: false, error: 'LinkedIn: like button not found or post already liked' };
      }
      await likeBtn.click();
      await page.waitForTimeout(1500);

      return { success: true };
    });
  }

  override async repost(postId: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      const activityId = postId.includes(':') ? postId.split(':').pop() : postId;
      await page.goto(`https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`, {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      // Click the Repost button
      const repostBtn = await this.findEl(page, [
        'button[aria-label*="Repost"]',
        'button[aria-label*="repost"]',
        '.social-actions-button:has(li-icon[type="repost"])',
        'button:has-text("Repost")',
      ]);
      if (!repostBtn) {
        return { success: false, error: 'LinkedIn: repost button not found' };
      }
      await repostBtn.click();
      await page.waitForTimeout(1500);

      // Click "Repost" (instant share, not "Quote")
      const instantRepost = await this.findEl(page, [
        'button[aria-label*="Repost instantly"]',
        '[data-control-name="reshare_instant"]',
        'li-icon[type="repost"]',
        'button:has-text("Repost")',
      ]);
      if (instantRepost) {
        await instantRepost.click();
        await page.waitForTimeout(2000);
      }

      return { success: true };
    });
  }

  async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }

  async getMentions(): Promise<Mention[]> {
    return this.browserAction(async (page: any) => {
      await page.goto('https://www.linkedin.com/notifications/', {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      const notifications = await page.$$eval('.notification-item', (els: any[]) =>
        els.slice(0, 10).map((el) => ({
          id: el.getAttribute('data-id') || '',
          text: el.querySelector('.notification-card__text')?.textContent?.trim() || '',
          author: el.querySelector('.notification-card__actor')?.textContent?.trim() || '',
        })),
      );
      return notifications;
    }, []);
  }

  // ─── Shared Playwright utilities ────────────────────────────────────────────

  protected async openPage(): Promise<any> {
    let playwright: any;
    try {
      playwright = require('playwright');
    } catch {
      throw new Error('Playwright not installed. Run: npx playwright install chromium');
    }
    const browser = await playwright.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    await context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    `);

    // Restore existing session cookies if available
    if (this.session?.cookies) {
      const cookies = Object.entries(this.session.cookies).map(([name, value]) => ({
        name,
        value,
        domain: this.cookieDomain(),
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax' as const,
      }));
      await context.addCookies(cookies);
    }

    return context.newPage();
  }

  protected cookieDomain(): string {
    return '.linkedin.com';
  }

  protected async extractCookies(page: any, tokenCookieName: string, ttlMs: number): Promise<SessionData> {
    const cookies = await page.context().cookies();
    const cookieMap: Record<string, string> = {};
    for (const c of cookies) cookieMap[c.name] = c.value;
    const session: SessionData = {
      token: cookieMap[tokenCookieName] || Object.values(cookieMap)[0] || '',
      cookies: cookieMap,
      expiresAt: Date.now() + ttlMs,
    };
    this.session = session;
    return session;
  }

  protected async findEl(page: any, selectors: string[]): Promise<any | null> {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) return el;
      } catch { /* try next */ }
    }
    return null;
  }

  protected async browserAction<T>(fn: (page: any) => Promise<T>, defaultValue?: T): Promise<T> {
    const page = await this.openPage();
    try {
      return await fn(page);
    } catch (err: any) {
      if (defaultValue !== undefined) return defaultValue;
      return { success: false, error: err.message } as any;
    } finally {
      await page.context().browser()?.close().catch(() => {});
    }
  }
}

export class InstagramClient extends LinkedInClient {
  constructor() {
    super();
    (this as any).platform = 'instagram';
  }

  protected override cookieDomain(): string { return '.instagram.com'; }

  override async login(username: string, password: string): Promise<SessionData> {
    const page = await this.openPage();
    try {
      // 'load' instead of 'networkidle' — Instagram SPA never reaches networkidle
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(3000); // wait for SPA to hydrate

      // Take screenshot for debugging
      await page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\instagram_debug.png', fullPage: true }).catch(() => {});

      // Try multiple selectors for username input
      const usernameSelectors = [
        'input[aria-label="Phone number, username, or email"]',
        'input[name="username"]',
        'input[autocomplete="username"]',
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
        throw new Error('Instagram login: could not find username input field');
      }
      await page.fill(usernameInput, username);
      await page.waitForTimeout(300);

      // Try multiple selectors for password input
      const passwordSelectors = [
        'input[aria-label="Password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
        'input[type="password"]',
        'input[placeholder*="Password"]',
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
        throw new Error('Instagram login: could not find password input field');
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
          'div[role="button"]',
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
        await page.waitForURL(/instagram\.com\/(?!accounts\/login)/, { timeout: 60000 });
      } catch {
        // Take screenshot to debug
        await page.screenshot({ path: 'D:\\Prospektlab-bot\\postiz-app\\instagram_after_login.png', fullPage: true }).catch(() => {});
        const currentUrl = page.url();
        const errText = await page.textContent('#slfErrorAlert, [data-testid="login-error"]').catch(() => '');
        
        // Handle "Save your login info?" or "Turn on notifications" screens
        if (currentUrl.includes('/accounts/onetap') || currentUrl.includes('/accounts/login/?next=')) {
          // Try to click "Not now" or similar to skip the prompt
          const skipBtn = await page.$('button:has-text("Not now"), button:has-text("Skip"), [role="button"]:has-text("Not now")').catch((): null => null);
          if (skipBtn) {
            await skipBtn.click();
            await page.waitForTimeout(2000);
          } else {
            // Just navigate to home page directly
            await page.goto('https://www.instagram.com/', { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(2000);
          }
        } else if (currentUrl.includes('/challenge') || currentUrl.includes('/security')) {
          throw new Error(`Instagram login: security challenge detected. Please log in manually via browser to verify your account.`);
        } else if (errText) {
          throw new Error(`Instagram login failed: ${errText}`);
        } else {
          // Check if we have session cookies anyway (maybe we're logged in but on a different page)
          const cookies = await page.context().cookies();
          const sessionCookie = cookies.find((c: any) => c.name === 'sessionid');
          if (sessionCookie) {
            // We're logged in, just on an unexpected page
            await page.goto('https://www.instagram.com/', { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(2000);
          } else {
            throw new Error(`Instagram login timed out at ${currentUrl}. Please check credentials and try again.`);
          }
        }
      }

      await page.waitForTimeout(2000);
      return await this.extractCookies(page, 'sessionid', 7 * 24 * 60 * 60 * 1000);
    } finally {
      await page.context().browser()?.close().catch(() => {});
    }
  }

  override async post(text: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      // Generate a text-based image using canvas, then upload it as a post
      await page.goto('https://www.instagram.com/', { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Create a text image via canvas and convert to blob
      const dataUrl: string = await page.evaluate((txt: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d')!;
        // Gradient background
        const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(0.5, '#16213e');
        grad.addColorStop(1, '#0f3460');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1080, 1080);
        // Text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.min(60, Math.max(28, 1600 / txt.length));
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        // Word wrap
        const words = txt.split(' ');
        const lines: string[] = [];
        let line = '';
        for (const w of words) {
          const test = line ? `${line} ${w}` : w;
          if (ctx.measureText(test).width > 900) { lines.push(line); line = w; }
          else line = test;
        }
        if (line) lines.push(line);
        const lineHeight = fontSize * 1.4;
        const startY = 540 - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((l, i) => ctx.fillText(l, 540, startY + i * lineHeight));
        return canvas.toDataURL('image/jpeg', 0.92);
      }, text);

      // Convert data URL to a file and trigger Instagram's create flow
      // Click the create/new post button
      const createBtn = await this.findEl(page, [
        'svg[aria-label="New post"]',
        '[aria-label="New post"]',
        'a[href="/create/style/"]',
        'svg[aria-label="New Post"]',
        '[aria-label="Create"]',
      ]);
      if (!createBtn) {
        return { success: false, error: 'Instagram: create post button not found' };
      }
      await createBtn.click();
      await page.waitForTimeout(2000);

      // Find the file input and upload the generated image
      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        return { success: false, error: 'Instagram: file input not found in create dialog' };
      }

      // Write the image data to a temp file and upload
      const fs = require('fs');
      const path = require('path');
      const tmpPath = path.join(require('os').tmpdir(), `ig_post_${Date.now()}.jpg`);
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      fs.writeFileSync(tmpPath, Buffer.from(base64Data, 'base64'));
      await fileInput.setInputFiles(tmpPath);
      await page.waitForTimeout(2000);
      fs.unlinkSync(tmpPath);

      // Click through the creation flow: Next -> Next -> Share
      for (let step = 0; step < 3; step++) {
        const nextBtn = await this.findEl(page, [
          'button:has-text("Next")',
          'button:has-text("Share")',
          'div[role="button"]:has-text("Next")',
          'div[role="button"]:has-text("Share")',
        ]);
        if (nextBtn) {
          await nextBtn.click();
          await page.waitForTimeout(2000);
        }
      }

      // Add caption if there's a caption field
      const captionInput = await this.findEl(page, [
        'textarea[aria-label="Write a caption..."]',
        'textarea[placeholder*="caption"]',
        '[contenteditable="true"][role="textbox"]',
      ]);
      if (captionInput) {
        await captionInput.click();
        await captionInput.fill(text);
        await page.waitForTimeout(500);
      }

      // Final share
      const shareBtn = await this.findEl(page, [
        'button:has-text("Share")',
        'div[role="button"]:has-text("Share")',
      ]);
      if (shareBtn) {
        await shareBtn.click();
        await page.waitForTimeout(3000);
      }

      return { success: true };
    });
  }

  override async searchPosts(query: string, limit?: number, subreddit?: string): Promise<SearchResult[]> {
    return this.browserAction(async (page: any) => {
      // Navigate to Instagram explore page with search query
      await page.goto(
        `https://www.instagram.com/explore/tags/${encodeURIComponent(query.replace(/\s+/g, ''))}/`,
        { waitUntil: 'load', timeout: 60000 },
      );
      await page.waitForTimeout(3000);

      // Extract posts from the page
      const posts = await page.$$eval('article a[href*="/p/"], article a[href*="/reel/"]', (els: any[]) =>
        els.slice(0, limit || 10).map((el, index) => {
          const href = el.getAttribute('href') || '';
          const id = href.split('/').filter(Boolean).pop() || `post_${index}`;
          return {
            id,
            text: '',
            author: '',
            extra: { href: `https://www.instagram.com${href}` },
          };
        }),
      );
      return posts;
    }, []);
  }

  override async comment(postId: string, text: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      // Navigate to the post
      const postUrl = postId.startsWith('http') ? postId : `https://www.instagram.com/p/${postId}/`;
      await page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Try to find and click the comment input
      const commentSelectors = [
        'textarea[placeholder*="Add a comment"]',
        'textarea[aria-label="Add a comment"]',
        'input[placeholder*="Add a comment"]',
        '[contenteditable="true"]',
      ];
      
      let commentInput = null;
      for (const sel of commentSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          commentInput = sel;
          break;
        } catch { /* try next */ }
      }
      
      if (!commentInput) {
        return { success: false, error: 'Instagram: Could not find comment input field' };
      }

      await page.fill(commentInput, text);
      await page.waitForTimeout(500);

      // Try to submit the comment
      const submitBtn = await page.$('button[type="submit"], button:has-text("Post"), div[role="button"]:has-text("Post")').catch((): null => null);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await page.press(commentInput, 'Enter');
      }

      await page.waitForTimeout(3000);

      // Check for error toasts or popups
      const errorText = await page.textContent('[role="alert"], [data-testid="toast"]').catch((): string => '');
      if (errorText && /error|failed|couldn't|try again/i.test(errorText)) {
        return { success: false, error: `Instagram comment error: ${errorText.slice(0, 200)}` };
      }

      return { success: true };
    });
  }

  override async like(postId: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      // Navigate to the post
      const postUrl = postId.startsWith('http') ? postId : `https://www.instagram.com/p/${postId}/`;
      await page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Try to find the like button (heart icon)
      const likeSelectors = [
        'svg[aria-label="Like"]',
        'button svg[aria-label="Like"]',
        '[aria-label="Like"]',
        'button:has-text("Like")',
        'span[aria-label="Like"]',
      ];
      
      let likeBtn = null;
      for (const sel of likeSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5000 });
          likeBtn = sel;
          break;
        } catch { /* try next */ }
      }
      
      if (!likeBtn) {
        return { success: false, error: 'Instagram: Could not find like button' };
      }

      await page.click(likeBtn, { force: true, timeout: 10000 });
      await page.waitForTimeout(2000);
      return { success: true };
    });
  }

  override async getMentions(limit = 20): Promise<Mention[]> {
    return this.browserAction(async (page: any) => {
      await page.goto('https://www.instagram.com/accounts/activity/', {
        waitUntil: 'load',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      // Try the notifications/activity page
      const mentions: Mention[] = await page.evaluate((lim: number) => {
        const items = document.querySelectorAll('[role="listitem"], article, [data-testid="notification"]');
        const results: any[] = [];
        items.forEach((item) => {
          if (results.length >= lim) return;
          const text = item.textContent?.trim() || '';
          if (text.includes('mentioned') || text.includes('tagged') || text.includes('commented')) {
            const link = item.querySelector('a[href*="/p/"]');
            const href = link?.getAttribute('href') || '';
            const id = href.split('/').filter(Boolean).pop() || `mention_${results.length}`;
            const authorLink = item.querySelector('a[href*="/"]');
            const author = authorLink?.textContent?.trim() || '';
            results.push({ id, text: text.slice(0, 300), author });
          }
        });
        return results;
      }, limit);
      return mentions;
    }, []);
  }

  override async repost(postId: string): Promise<ActionResult> {
    return this.browserAction(async (page: any) => {
      const postUrl = postId.startsWith('http') ? postId : `https://www.instagram.com/p/${postId}/`;
      await page.goto(postUrl, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Click the share/paper plane button
      const shareBtn = await this.findEl(page, [
        'svg[aria-label="Share Post"]',
        '[aria-label="Share Post"]',
        'svg[aria-label="Share"]',
        '[aria-label="Share"]',
        'button svg[aria-label="Direct"]',
      ]);
      if (!shareBtn) {
        return { success: false, error: 'Instagram: share button not found' };
      }
      await shareBtn.click();
      await page.waitForTimeout(1500);

      // Click "Add post to your story" or "Share to..." option
      const storyBtn = await this.findEl(page, [
        'button:has-text("Add post to your story")',
        'button:has-text("Add to story")',
        'button:has-text("Share to")',
        '[role="button"]:has-text("story")',
      ]);
      if (storyBtn) {
        await storyBtn.click();
        await page.waitForTimeout(2000);

        // Click "Share to Story" confirmation
        const confirmBtn = await this.findEl(page, [
          'button:has-text("Share")',
          'button:has-text("Done")',
          'div[role="button"]:has-text("Share")',
        ]);
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
        }
        return { success: true };
      }

      return { success: false, error: 'Instagram: story share option not found' };
    });
  }

  override async reply(mentionId: string, text: string): Promise<ActionResult> {
    return this.comment(mentionId, text);
  }
}
