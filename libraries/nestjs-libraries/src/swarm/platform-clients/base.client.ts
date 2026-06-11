/**
 * Base interface and shared types for all platform clients.
 * Each client logs in via credentials (no API keys) and exposes
 * typed methods that sub-agents call directly.
 */

export interface SessionData {
  token: string;
  cookies?: Record<string, string>;
  extra?: Record<string, any>;
  expiresAt?: number;
}

export interface ActionResult {
  success: boolean;
  id?: string;
  data?: any;
  error?: string;
}

export interface SearchResult {
  id: string;
  text: string;
  author: string;
  authorId?: string;
  /** platform-specific identifiers needed for reply/like */
  extra?: Record<string, any>;
}

export interface Mention {
  id: string;
  text: string;
  author: string;
  extra?: Record<string, any>;
}

export abstract class BasePlatformClient {
  protected session: SessionData | null = null;

  constructor(public readonly platform: string) {}

  abstract login(username: string, password: string): Promise<SessionData>;

  /** Restore a previously saved session without re-logging in */
  restoreSession(session: SessionData): void {
    this.session = session;
  }

  isSessionValid(): boolean {
    if (!this.session) return false;
    if (this.session.expiresAt && this.session.expiresAt < Date.now()) return false;
    return true;
  }

  /** Post original content */
  abstract post(text: string): Promise<ActionResult>;

  /** Search for relevant posts by query. Optional subreddit for Reddit. */
  abstract searchPosts(query: string, limit?: number, subreddit?: string): Promise<SearchResult[]>;

  /** Comment/reply on a post */
  abstract comment(postId: string, text: string, extra?: any): Promise<ActionResult>;

  /** Like/upvote a post */
  abstract like(postId: string, extra?: any): Promise<ActionResult>;

  /** Get own mentions / notifications */
  abstract getMentions(limit?: number): Promise<Mention[]>;

  /** Reply to a mention */
  abstract reply(mentionId: string, text: string, extra?: any): Promise<ActionResult>;

  /** Repost/share/retweet */
  repost?(postId: string, extra?: any): Promise<ActionResult>;

  protected headersWith(extra: Record<string, string> = {}): Record<string, string> {
    return { 'Content-Type': 'application/json', ...extra };
  }
}
