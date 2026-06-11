import { __awaiter } from "tslib";
import { BasePlatformClient } from '../../libraries/nestjs-libraries/src/swarm/platform-clients/base.client';
import { SimpleAgent } from '../../libraries/nestjs-libraries/src/swarm/simple.agent';
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
    ioRedis: {
        lpush: jest.fn().mockResolvedValue(1),
        ltrim: jest.fn().mockResolvedValue(1),
    },
}));
class FakeClient extends BasePlatformClient {
    constructor(platform) {
        super(platform);
        this.postResult = { success: true, id: 'post-1' };
        this.commentResult = { success: true, id: 'comment-1' };
        this.likeResult = { success: true, id: 'like-1' };
        this.replyResult = { success: true, id: 'reply-1' };
        this.searchResults = [];
        this.mentions = [];
    }
    login(_username, _password) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('not needed in unit tests');
        });
    }
    post(_text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.postResult;
        });
    }
    searchPosts(_query_1) {
        return __awaiter(this, arguments, void 0, function* (_query, _limit = 10) {
            return this.searchResults;
        });
    }
    comment(_postId, _text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.commentResult;
        });
    }
    like(_postId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.likeResult;
        });
    }
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (_limit = 25) {
            return this.mentions;
        });
    }
    reply(_mentionId, _text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.replyResult;
        });
    }
}
describe('SimpleAgent planning and execution', () => {
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    beforeEach(() => {
        delete process.env.OPENAI_API_KEY;
    });
    afterAll(() => {
        if (originalOpenAiKey) {
            process.env.OPENAI_API_KEY = originalOpenAiKey;
        }
        else {
            delete process.env.OPENAI_API_KEY;
        }
    });
    it('parses object-shaped llm planner output and expands to the requested subagent count', () => __awaiter(void 0, void 0, void 0, function* () {
        const originalFetch = global.fetch;
        process.env.OPENAI_API_KEY = 'test-key';
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: () => __awaiter(void 0, void 0, void 0, function* () {
                return ({
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    tasks: [
                                        {
                                            name: 'poster',
                                            action: 'post',
                                            intervalMs: 2 * 60 * 60 * 1000,
                                            topic: 'AI agents',
                                            targetSubreddit: 'startups',
                                        },
                                    ],
                                }),
                            },
                        },
                    ],
                });
            }),
        });
        Object.defineProperty(globalThis, 'fetch', {
            value: fetchMock,
            configurable: true,
        });
        try {
            const client = new FakeClient('reddit');
            const agent = new SimpleAgent('agent-llm', 'deployment-1', 'cred-1', 'reddit', 'tester', 'Fork yourself into 3 subagents and post about AI agents in r/startups every 2 hours.', client, 'org-1');
            const preview = yield agent.previewPlan();
            expect(preview.source).toBe('llm');
            expect(preview.requestedSubagentCount).toBe(3);
            expect(preview.tasks).toHaveLength(3);
            expect(preview.tasks.every((task) => task.action === 'post')).toBe(true);
            expect(preview.warnings.join(' ').toLowerCase()).toContain('expanded');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        }
        finally {
            Object.defineProperty(globalThis, 'fetch', {
                value: originalFetch,
                configurable: true,
            });
            delete process.env.OPENAI_API_KEY;
        }
    }));
    it('supports more than ten requested subagents', () => __awaiter(void 0, void 0, void 0, function* () {
        const client = new FakeClient('reddit');
        const agent = new SimpleAgent('agent-12', 'deployment-1', 'cred-1', 'reddit', 'tester', 'Fork yourself into 12 subagents and post about AI agents in r/startups every 2 hours.', client, 'org-1');
        const preview = yield agent.previewPlan();
        expect(preview.requestedSubagentCount).toBe(12);
        expect(preview.tasks).toHaveLength(12);
        expect(preview.warnings.join(' ').toLowerCase()).toContain('expanded');
    }));
    it('builds instruction-driven reddit tasks with explicit subreddit', () => __awaiter(void 0, void 0, void 0, function* () {
        const client = new FakeClient('reddit');
        const agent = new SimpleAgent('agent-1', 'deployment-1', 'cred-1', 'reddit', 'tester', 'Post about startup fundraising in r/startups every 2 hours. Comment on startup posts every 45 minutes. Like startup funding posts every 30 minutes. Reply to mentions every 30 minutes.', client, 'org-1');
        const preview = yield agent.previewPlan();
        expect(preview.validationErrors).toHaveLength(0);
        expect(preview.tasks.length).toBeGreaterThanOrEqual(3);
        expect(preview.tasks.some((task) => task.action === 'post')).toBe(true);
        expect(preview.tasks.some((task) => task.action === 'search_and_comment')).toBe(true);
        expect(preview.tasks.some((task) => task.action === 'search_and_like')).toBe(true);
        const postTask = preview.tasks.find((task) => task.action === 'post');
        expect(postTask === null || postTask === void 0 ? void 0 : postTask.targetSubreddit).toBe('startups');
    }));
    it('rejects reddit prompts that ask to create subreddits and spam at unsupported cadence', () => __awaiter(void 0, void 0, void 0, function* () {
        const client = new FakeClient('reddit');
        const agent = new SimpleAgent('agent-1', 'deployment-1', 'cred-1', 'reddit', 'tester', 'create a subreddit and post every 1 mins saying "hi" for 5 mins and fork yourself into 100 subreddits and do comments on various indian startup related communities for 10 mins.', client, 'org-1');
        const preview = yield agent.previewPlan();
        expect(preview.tasks).toHaveLength(0);
        expect(preview.summary).toHaveLength(0);
        expect(preview.validationErrors.join(' ').toLowerCase()).toContain('subreddit creation is not supported');
        expect(preview.warnings.join(' ').toLowerCase()).toContain('30m minimum');
        expect(preview.warnings.join(' ').toLowerCase()).toContain('duration windows');
        expect(preview.warnings.join(' ').toLowerCase()).toContain('subagents or workers');
    }));
    it('falls back to safe reddit tasks when subreddit is missing', () => __awaiter(void 0, void 0, void 0, function* () {
        const client = new FakeClient('reddit');
        const agent = new SimpleAgent('agent-1', 'deployment-1', 'cred-1', 'reddit', 'tester', 'Post weekly updates about AI automation every 2 hours', client, 'org-1');
        const preview = yield agent.previewPlan();
        expect(preview.validationErrors).toHaveLength(0);
        expect(preview.tasks.some((task) => task.action === 'post')).toBe(false);
        expect(preview.tasks.some((task) => task.action === 'search_and_comment')).toBe(true);
        expect(preview.warnings.join(' ').toLowerCase()).toContain('subreddit');
    }));
    it('skips unsupported actions on limited platforms instead of pretending success', () => __awaiter(void 0, void 0, void 0, function* () {
        const client = new FakeClient('threads');
        const agent = new SimpleAgent('agent-1', 'deployment-1', 'cred-1', 'threads', 'tester', 'Post product updates every 2 hours and comment on similar posts every 30 minutes.', client, 'org-1');
        const preview = yield agent.previewPlan();
        expect(preview.tasks.some((task) => task.action === 'post')).toBe(true);
        expect(preview.tasks.some((task) => task.action === 'search_and_comment')).toBe(false);
        expect(preview.warnings.join(' ')).toContain('does not support');
    }));
    it('records an execution error when platform action returns success=false', () => __awaiter(void 0, void 0, void 0, function* () {
        const client = new FakeClient('reddit');
        client.postResult = { success: false, error: 'rate limited' };
        const plan = {
            name: 'poster_1',
            action: 'post',
            intervalMs: 60 * 60 * 1000,
            topic: 'AI agents',
            targetSubreddit: 'startups',
        };
        const agent = new SimpleAgent('agent-1', 'deployment-1', 'cred-1', 'reddit', 'tester', 'Post in r/startups', client, 'org-1');
        yield agent.executeTask(plan);
        expect(agent.errorMessage).toContain('rate limited');
    }));
});
//# sourceMappingURL=simple.agent.test.js.map