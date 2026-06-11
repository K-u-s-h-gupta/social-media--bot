import { SUPPORTED_PLATFORMS } from '../../libraries/nestjs-libraries/src/swarm/platform-clients/client.factory';
import { getPlatformCapabilities } from '../../libraries/nestjs-libraries/src/swarm/platform-capabilities';
describe('platform capability registry', () => {
    it('has capability metadata for every supported platform', () => {
        const missing = [];
        for (const platform of SUPPORTED_PLATFORMS) {
            const capability = getPlatformCapabilities(platform.id);
            if (!capability || capability.platform !== platform.id) {
                missing.push(platform.id);
            }
            expect(typeof capability.supports.post).toBe('boolean');
            expect(typeof capability.supports.search).toBe('boolean');
            expect(typeof capability.supports.comment).toBe('boolean');
            expect(typeof capability.supports.like).toBe('boolean');
            expect(typeof capability.supports.mentions).toBe('boolean');
            expect(typeof capability.supports.reply).toBe('boolean');
            expect(typeof capability.supports.repost).toBe('boolean');
            expect(Array.isArray(capability.notes)).toBe(true);
        }
        expect(missing).toHaveLength(0);
    });
    it('flags reddit with explicit subreddit requirement', () => {
        const reddit = getPlatformCapabilities('reddit');
        expect(reddit.supports.post).toBe(true);
        expect(reddit.notes.join(' ').toLowerCase()).toContain('subreddit');
    });
});
//# sourceMappingURL=platform-capabilities.test.js.map