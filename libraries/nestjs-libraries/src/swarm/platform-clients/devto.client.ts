/**
 * Dev.to client — uses the free Dev.to API with a personal access token.
 * Get your token: dev.to → Settings → Extensions → DEV Community API Keys
 * Takes 30 seconds. Paste the token as the "password" when adding the credential.
 * Username can be your handle.
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

const BASE = 'https://dev.to/api';

export class DevToClient extends BasePlatformClient {
  private apiKey = '';

  constructor() { super('dev-to'); }

  /** For Dev.to the "password" field IS the API key */
  async login(username: string, apiKey: string): Promise<SessionData> {
    // Verify the key works
    const resp = await fetch(`${BASE}/users/me`, {
      headers: { 'api-key': apiKey },
    });
    if (!resp.ok) throw new Error(`Dev.to API key invalid (${resp.status})`);
    const user = await resp.json() as any;

    this.apiKey = apiKey;
    const session: SessionData = {
      token: apiKey,
      extra: { username: user.username || username, userId: user.id },
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // keys don't expire
    };
    this.session = session;
    return session;
  }

  override restoreSession(session: SessionData): void {
    super.restoreSession(session);
    this.apiKey = session.token;
  }

  private async req(path: string, method = 'GET', body?: any): Promise<Response> {
    return fetch(`${BASE}${path}`, {
      method,
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  async post(text: string): Promise<ActionResult> {
    const lines = text.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim() || 'New Post';
    const body_markdown = lines.slice(1).join('\n').trim() || text;

    const resp = await this.req('/articles', 'POST', {
      article: {
        title,
        body_markdown,
        published: true,
        tags: [],
      },
    });
    if (!resp.ok) return { success: false, error: `${resp.status}` };
    const data = await resp.json() as any;
    return { success: true, id: String(data.id), data: { url: data.url } };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    const resp = await this.req(`/articles?tag=${encodeURIComponent(query)}&per_page=${limit}`);
    if (!resp.ok) return [];
    const articles = await resp.json() as any[];
    return articles.map((a) => ({
      id: String(a.id),
      text: a.title,
      author: a.user?.username || '',
      extra: { url: a.url },
    }));
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    const resp = await this.req('/comments', 'POST', {
      body_markdown: text,
      article_id: parseInt(postId, 10),
    });
    return { success: resp.ok };
  }

  async like(postId: string): Promise<ActionResult> {
    // Dev.to doesn't have a like API publicly
    return { success: false, error: 'Dev.to like not available via API' };
  }

  async getMentions(limit = 20): Promise<Mention[]> {
    // Get my recent articles and their comments as "mentions"
    const resp = await this.req(`/articles?username=${this.session?.extra?.username}&per_page=${limit}`);
    if (!resp.ok) return [];
    return [];
  }

  async reply(mentionId: string, text: string): Promise<ActionResult> {
    const resp = await this.req('/comments', 'POST', {
      body_markdown: text,
      parent_id: parseInt(mentionId, 10),
    });
    return { success: resp.ok };
  }
}
