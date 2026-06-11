const DEFAULT_CAPABILITIES = {
    supports: {
        post: false,
        search: false,
        comment: false,
        like: false,
        mentions: false,
        reply: false,
        repost: false,
    },
    notes: ['Capability data is not available for this platform yet.'],
};
const CAPABILITY_MAP = {
    x: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: [],
    },
    bluesky: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: [],
    },
    reddit: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: ['Swarm post tasks require an explicit r/subreddit target.'],
    },
    linkedin: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: [],
    },
    'linkedin-page': {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: [],
    },
    instagram: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: ['Instagram posts auto-generate a text image when no media is provided.'],
    },
    threads: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: true,
            reply: true,
            repost: true,
        },
        notes: [],
    },
    facebook: {
        supports: {
            post: false,
            search: false,
            comment: false,
            like: false,
            mentions: false,
            reply: false,
            repost: false,
        },
        notes: ['Facebook client currently supports login only for session bootstrap.'],
    },
    discord: {
        supports: {
            post: true,
            search: false,
            comment: true,
            like: true,
            mentions: false,
            reply: true,
            repost: false,
        },
        notes: ['Discord actions need channel context (defaultChannelId or per-action extra data).'],
    },
    tiktok: {
        supports: {
            post: false,
            search: true,
            comment: false,
            like: false,
            mentions: false,
            reply: false,
            repost: false,
        },
        notes: ['TikTok text-only posting is not supported in this client.'],
    },
    pinterest: {
        supports: {
            post: false,
            search: true,
            comment: true,
            like: false,
            mentions: false,
            reply: true,
            repost: false,
        },
        notes: ['Pinterest post creation needs image URL + board context.'],
    },
    medium: {
        supports: {
            post: true,
            search: false,
            comment: true,
            like: true,
            mentions: false,
            reply: true,
            repost: false,
        },
        notes: ['Medium search and mentions polling are not implemented in this client.'],
    },
    'dev-to': {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: false,
            mentions: false,
            reply: true,
            repost: false,
        },
        notes: ['Dev.to like API is not available in this client.'],
    },
    hashnode: {
        supports: {
            post: true,
            search: true,
            comment: true,
            like: true,
            mentions: false,
            reply: true,
            repost: false,
        },
        notes: ['Hashnode mentions polling is not implemented in this client.'],
    },
};
export function getPlatformCapabilities(platform) {
    const normalized = platform === 'twitter' ? 'x' : platform;
    const record = CAPABILITY_MAP[normalized] || DEFAULT_CAPABILITIES;
    return {
        platform: normalized,
        supports: Object.assign({}, record.supports),
        notes: [...record.notes],
    };
}
export function supportsTaskAction(capabilities, action) {
    switch (action) {
        case 'post':
            return capabilities.supports.post;
        case 'search_and_comment':
            return capabilities.supports.search && capabilities.supports.comment;
        case 'search_and_like':
            return capabilities.supports.search && capabilities.supports.like;
        case 'reply_mentions':
            return capabilities.supports.mentions && capabilities.supports.reply;
        default:
            return false;
    }
}
//# sourceMappingURL=platform-capabilities.js.map