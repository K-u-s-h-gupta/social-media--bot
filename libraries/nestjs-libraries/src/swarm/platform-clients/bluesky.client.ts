/**
 * Bluesky (AT Protocol) client.
 * Uses username + app-password — no API keys needed.
 * App passwords: bsky.social/settings/app-passwords (takes 10 seconds to create)
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

const BASE = 'https://bsky.social/xrpc';

export class BlueskyClient extends BasePlatformClient {
  private did = '';
  private accessJwt = '';
  private refreshJwt = '';

  constructor() {
    super('bluesky');
  }

  async login(identifier: string, password: string): Promise<SessionData> {
    const resp = await fetch(`${BASE}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Bluesky login failed (${resp.status}): ${err}`);
    }
    const data = (await resp.json()) as any;
    this.did = data.did;
    this.accessJwt = data.accessJwt;
    this.refreshJwt = data.refreshJwt;
    const session: SessionData = {
      token: data.accessJwt,
      extra: { refreshJwt: data.refreshJwt, did: data.did, handle: data.handle },
      expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2h
    };
    this.session = session;
    return session;
  }

  override restoreSession(session: SessionData): void {
    super.restoreSession(session);
    this.accessJwt = session.token;
    this.did = session.extra?.did || '';
    this.refreshJwt = session.extra?.refreshJwt || '';
  }

  async post(text: string): Promise<ActionResult> {
    const resp = await this.req('/com.atproto.repo.createRecord', 'POST', {
      repo: this.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString() },
    });
    if (!resp.ok) return { success: false, error: `${resp.status}` };
    const data = (await resp.json()) as any;
    return { success: true, id: data.uri };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    const resp = await this.req(
      `/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (!resp.ok) return [];
    const data = (await resp.json()) as any;
    return (data.posts || []).map((p: any) => ({
      id: p.uri,
      text: p.record?.text || '',
      author: p.author?.handle || '',
      extra: { cid: p.cid, uri: p.uri },
    }));
  }

  async comment(postId: string, text: string, extra?: any): Promise<ActionResult> {
    const { uri, cid } = extra || {};
    const resp = await this.req('/com.atproto.repo.createRecord', 'POST', {
      repo: this.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        reply: {
          root: { uri: uri || postId, cid: cid || '' },
          parent: { uri: uri || postId, cid: cid || '' },
        },
        createdAt: new Date().toISOString(),
      },
    });
    return { success: resp.ok };
  }

  async like(postId: string, extra?: any): Promise<ActionResult> {
    const { cid } = extra || {};
    const resp = await this.req('/com.atproto.repo.createRecord', 'POST', {
      repo: this.did,
      collection: 'app.bsky.feed.like',
      record: {
        $type: 'app.bsky.feed.like',
        subject: { uri: postId, cid: cid || '' },
        createdAt: new Date().toISOString(),
      },
    });
    return { success: resp.ok };
  }

  async getMentions(limit = 20): Promise<Mention[]> {
    const resp = await this.req(`/app.bsky.notification.listNotifications?limit=${limit}`);
    if (!resp.ok) return [];
    const data = (await resp.json()) as any;
    return (data.notifications || [])
      .filter((n: any) => n.reason === 'mention' || n.reason === 'reply')
      .map((n: any) => ({
        id: n.uri,
        text: n.record?.text || '',
        author: n.author?.handle || '',
        extra: { cid: n.cid, parentUri: n.record?.reply?.parent?.uri },
      }));
  }

  async reply(mentionId: string, text: string, extra?: any): Promise<ActionResult> {
    return this.comment(mentionId, text, extra);
  }

  override async repost(postId: string, extra?: any): Promise<ActionResult> {
    const { cid } = extra || {};
    const resp = await this.req('/com.atproto.repo.createRecord', 'POST', {
      repo: this.did,
      collection: 'app.bsky.feed.repost',
      record: {
        $type: 'app.bsky.feed.repost',
        subject: { uri: postId, cid: cid || '' },
        createdAt: new Date().toISOString(),
      },
    });
    return { success: resp.ok };
  }

  private async req(path: string, method = 'GET', body?: any): Promise<Response> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessJwt}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
}
