import { BlueskyClient } from './bluesky.client';
import { RedditClient } from './reddit.client';
import { XClient } from './x.client';
import { LinkedInClient, InstagramClient } from './browser.client';
import { FacebookClient } from './facebook.client';
import { ThreadsClient } from './threads.client';
import { DiscordClient } from './discord.client';
import { TikTokClient } from './tiktok.client';
import { PinterestClient } from './pinterest.client';
import { MediumClient } from './medium.client';
import { DevToClient } from './devto.client';
import { HashnodeClient } from './hashnode.client';
export const SUPPORTED_PLATFORMS = [
    { id: 'x', label: 'X / Twitter', auth: 'credentials', description: 'Username + password' },
    { id: 'bluesky', label: 'Bluesky', auth: 'app-password', description: 'Handle + app password (bsky.social/settings/app-passwords)' },
    { id: 'reddit', label: 'Reddit', auth: 'credentials', description: 'Username + password' },
    { id: 'linkedin', label: 'LinkedIn (Personal)', auth: 'credentials', description: 'Email + password' },
    { id: 'linkedin-page', label: 'LinkedIn (Page)', auth: 'credentials', description: 'Email + password (page admin)' },
    { id: 'instagram', label: 'Instagram', auth: 'credentials', description: 'Username + password' },
    { id: 'threads', label: 'Threads', auth: 'credentials', description: 'Instagram username + password' },
    { id: 'facebook', label: 'Facebook', auth: 'credentials', description: 'Email + password' },
    { id: 'discord', label: 'Discord', auth: 'credentials', description: 'Email + password (browser login)' },
    { id: 'tiktok', label: 'TikTok', auth: 'credentials', description: 'Email + password' },
    { id: 'pinterest', label: 'Pinterest', auth: 'credentials', description: 'Email + password' },
    { id: 'medium', label: 'Medium', auth: 'credentials', description: 'Email + password' },
    { id: 'dev-to', label: 'Dev.to', auth: 'token', description: 'Username + API token (dev.to → Settings → Extensions)' },
    { id: 'hashnode', label: 'Hashnode', auth: 'token', description: 'Username + Personal Access Token (hashnode.com → Account Settings → Developer)' },
];
export function createPlatformClient(platform) {
    switch (platform) {
        case 'bluesky': return new BlueskyClient();
        case 'reddit': return new RedditClient();
        case 'x':
        case 'twitter': return new XClient();
        case 'linkedin':
        case 'linkedin-page': return new LinkedInClient();
        case 'instagram': return new InstagramClient();
        case 'facebook': return new FacebookClient();
        case 'threads': return new ThreadsClient();
        case 'discord': return new DiscordClient();
        case 'tiktok': return new TikTokClient();
        case 'pinterest': return new PinterestClient();
        case 'medium': return new MediumClient();
        case 'dev-to': return new DevToClient();
        case 'hashnode': return new HashnodeClient();
        default:
            throw new Error(`No client implementation for platform: ${platform}`);
    }
}
export { BasePlatformClient } from './base.client';
//# sourceMappingURL=client.factory.js.map