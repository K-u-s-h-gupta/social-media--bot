/**
 * Hashnode client — uses Hashnode's GraphQL API with a personal access token.
 * Get your token: hashnode.com → Account Settings → Developer → Personal Access Tokens
 * Paste the token as the "password" when adding the credential.
 * Username = your Hashnode username (or blog publication host).
 */
import { BasePlatformClient, SessionData, ActionResult, SearchResult, Mention } from './base.client';

const GQL = 'https://gql.hashnode.com';

export class HashnodeClient extends BasePlatformClient {
  private token = '';
  private publicationId = '';

  constructor() { super('hashnode'); }

  async login(username: string, apiToken: string): Promise<SessionData> {
    this.token = apiToken;
    // Verify token + get user/publication info
    const resp = await this.gql(`
      query Me {
        me {
          id
          username
          publications(first: 1) {
            edges { node { id title } }
          }
        }
      }
    `);
    if (!resp.ok) throw new Error(`Hashnode token invalid (${resp.status})`);
    const data = await resp.json() as any;
    const user = data?.data?.me;
    if (!user) throw new Error('Hashnode: could not fetch user info');

    this.publicationId = user.publications?.edges?.[0]?.node?.id || '';

    const session: SessionData = {
      token: apiToken,
      extra: { username: user.username, userId: user.id, publicationId: this.publicationId },
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
    this.session = session;
    return session;
  }

  override restoreSession(session: SessionData): void {
    super.restoreSession(session);
    this.token = session.token;
    this.publicationId = session.extra?.publicationId || '';
  }

  private gql(query: string, variables?: any): Promise<Response> {
    return fetch(GQL, {
      method: 'POST',
      headers: {
        'Authorization': this.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
  }

  async post(text: string): Promise<ActionResult> {
    const pubId = this.publicationId;
    if (!pubId) return { success: false, error: 'No Hashnode publication found for this account' };

    const lines = text.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim() || 'New Post';
    const contentMarkdown = lines.slice(1).join('\n').trim() || text;

    const resp = await this.gql(`
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post { id url }
        }
      }
    `, {
      input: {
        title,
        contentMarkdown,
        publicationId: pubId,
        tags: [],
      },
    });

    if (!resp.ok) return { success: false, error: `${resp.status}` };
    const data = await resp.json() as any;
    const post = data?.data?.publishPost?.post;
    if (!post) return { success: false, error: data?.errors?.[0]?.message || 'Unknown error' };
    return { success: true, id: post.id, data: { url: post.url } };
  }

  async searchPosts(query: string, limit = 10, subreddit?: string): Promise<SearchResult[]> {
    const resp = await this.gql(`
      query SearchPosts($query: String!, $first: Int) {
        searchPostsOfPublication(first: $first, filter: { query: $query }) {
          edges { node { id title author { username } } }
        }
      }
    `, { query, first: limit });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    const edges = data?.data?.searchPostsOfPublication?.edges || [];
    return edges.map((e: any) => ({
      id: e.node.id,
      text: e.node.title,
      author: e.node.author?.username || '',
    }));
  }

  async comment(postId: string, text: string): Promise<ActionResult> {
    const resp = await this.gql(`
      mutation AddComment($input: AddCommentInput!) {
        addComment(input: $input) {
          comment { id }
        }
      }
    `, { input: { postId, contentMarkdown: text } });
    if (!resp.ok) return { success: false, error: `${resp.status}` };
    const data = await resp.json() as any;
    return { success: !!data?.data?.addComment?.comment?.id };
  }

  async like(postId: string): Promise<ActionResult> {
    const resp = await this.gql(`
      mutation LikePost($input: LikePostInput!) {
        likePost(input: $input) { post { id } }
      }
    `, { input: { postId, likesCount: 1 } });
    return { success: resp.ok };
  }

  async getMentions(): Promise<Mention[]> { return []; }

  async reply(commentId: string, text: string): Promise<ActionResult> {
    const resp = await this.gql(`
      mutation ReplyToComment($input: ReplyToCommentInput!) {
        replyToComment(input: $input) { reply { id } }
      }
    `, { input: { commentId, contentMarkdown: text } });
    return { success: resp.ok };
  }
}
