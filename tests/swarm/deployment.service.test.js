import { __awaiter } from "tslib";
import { DeploymentService } from '../../libraries/nestjs-libraries/src/swarm/deployment.service';
import { SimpleAgent } from '../../libraries/nestjs-libraries/src/swarm/simple.agent';
import { BasePlatformClient } from '../../libraries/nestjs-libraries/src/swarm/platform-clients/base.client';
class FakeClient extends BasePlatformClient {
    constructor(platform) {
        super(platform);
    }
    login(_username, _password) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('not needed in tests');
        });
    }
    post(_text) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: true, id: 'post-1' };
        });
    }
    searchPosts(_query_1) {
        return __awaiter(this, arguments, void 0, function* (_query, _limit = 10) {
            return [];
        });
    }
    comment(_postId, _text) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: true, id: 'comment-1' };
        });
    }
    like(_postId) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: true, id: 'like-1' };
        });
    }
    getMentions() {
        return __awaiter(this, arguments, void 0, function* (_limit = 25) {
            return [];
        });
    }
    reply(_mentionId, _text) {
        return __awaiter(this, void 0, void 0, function* () {
            return { success: true, id: 'reply-1' };
        });
    }
}
describe('DeploymentService', () => {
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
    it('runs dry-run planning without creating deployment records', () => __awaiter(void 0, void 0, void 0, function* () {
        const credentialService = {
            listCredentials: jest.fn().mockResolvedValue([
                {
                    id: 'cred-1',
                    platform: 'reddit',
                    username: 'reddit-user',
                    name: 'Reddit User',
                    enabled: true,
                },
            ]),
            getClient: jest.fn().mockResolvedValue(new FakeClient('reddit')),
        };
        const deploymentRepository = {
            createDeployment: jest.fn(),
            createAgent: jest.fn(),
            updateDeploymentStatus: jest.fn(),
        };
        const service = new DeploymentService(credentialService, deploymentRepository);
        const result = yield service.deploy('org-1', 'Post updates about AI every 2 hours', ['cred-1'], [], true);
        expect(result.dryRun).toBe(true);
        expect(result.deploymentId).toBeNull();
        expect(result.started).toBe(0);
        expect(result.plannedTasks).toHaveLength(1);
        expect(result.validationErrors).toHaveLength(0);
        expect(result.plannedTasks[0].tasks.length).toBeGreaterThan(0);
        expect(result.warnings.join(' ').toLowerCase()).toContain('fallback');
        expect(deploymentRepository.createDeployment).not.toHaveBeenCalled();
        expect(deploymentRepository.createAgent).not.toHaveBeenCalled();
    }));
    it('honors an explicit subagent count during dry-run planning', () => __awaiter(void 0, void 0, void 0, function* () {
        const credentialService = {
            listCredentials: jest.fn().mockResolvedValue([
                {
                    id: 'cred-1',
                    platform: 'reddit',
                    username: 'reddit-user',
                    name: 'Reddit User',
                    enabled: true,
                },
            ]),
            getClient: jest.fn().mockResolvedValue(new FakeClient('reddit')),
        };
        const deploymentRepository = {
            createDeployment: jest.fn(),
            createAgent: jest.fn(),
            updateDeploymentStatus: jest.fn(),
        };
        const service = new DeploymentService(credentialService, deploymentRepository);
        const result = yield service.deploy('org-1', 'Fork yourself into 4 subagents and post startup updates in r/startups every 2 hours', ['cred-1'], [], true, 4);
        expect(result.requestedSubagentCount).toBe(4);
        expect(result.plannedTasks).toHaveLength(1);
        expect(result.plannedTasks[0].requestedSubagentCount).toBe(4);
        expect(result.plannedTasks[0].tasks).toHaveLength(4);
        expect(result.warnings.join(' ').toLowerCase()).toContain('expanded');
        expect(deploymentRepository.createDeployment).not.toHaveBeenCalled();
        expect(deploymentRepository.createAgent).not.toHaveBeenCalled();
    }));
    it('fails fast when the planner produces no runnable tasks', () => __awaiter(void 0, void 0, void 0, function* () {
        const credentialService = {
            listCredentials: jest.fn().mockResolvedValue([
                {
                    id: 'cred-1',
                    platform: 'reddit',
                    username: 'reddit-user',
                    name: 'Reddit User',
                    enabled: true,
                },
            ]),
            getClient: jest.fn().mockResolvedValue(new FakeClient('reddit')),
        };
        const deploymentRepository = {
            createDeployment: jest.fn().mockResolvedValue({ id: 'dep-1' }),
            createAgent: jest.fn(),
            updateDeploymentStatus: jest.fn(),
        };
        const previewSpy = jest.spyOn(SimpleAgent.prototype, 'previewPlan').mockResolvedValue({
            source: 'deterministic',
            capabilities: {
                platform: 'reddit',
                supports: {
                    post: true,
                    search: true,
                    comment: true,
                    like: true,
                    mentions: true,
                    reply: true,
                    repost: false,
                },
                notes: [],
            },
            requestedSubagentCount: null,
            tasks: [],
            summary: [],
            warnings: [],
            validationErrors: [],
        });
        const startSpy = jest.spyOn(SimpleAgent.prototype, 'start').mockResolvedValue(undefined);
        try {
            const service = new DeploymentService(credentialService, deploymentRepository);
            const result = yield service.deploy('org-1', 'fork yourself into 10 subagents', ['cred-1'], [], false);
            expect(result.started).toBe(0);
            expect(result.failed[0]).toContain('no runnable tasks');
            expect(result.validationErrors[0]).toContain('no runnable tasks');
            expect(deploymentRepository.createAgent).not.toHaveBeenCalled();
            expect(startSpy).not.toHaveBeenCalled();
        }
        finally {
            previewSpy.mockRestore();
            startSpy.mockRestore();
        }
    }));
    it('creates deployment and starts agent when plan is valid', () => __awaiter(void 0, void 0, void 0, function* () {
        const credentialService = {
            listCredentials: jest.fn().mockResolvedValue([
                {
                    id: 'cred-1',
                    platform: 'reddit',
                    username: 'reddit-user',
                    name: 'Reddit User',
                    enabled: true,
                },
            ]),
            getClient: jest.fn().mockResolvedValue(new FakeClient('reddit')),
        };
        const deploymentRepository = {
            createDeployment: jest.fn().mockResolvedValue({ id: 'dep-1' }),
            createAgent: jest.fn().mockResolvedValue({ id: 'agent-1' }),
            updateAgentStatus: jest.fn().mockResolvedValue({}),
            updateDeploymentStatus: jest.fn().mockResolvedValue({}),
        };
        const startSpy = jest.spyOn(SimpleAgent.prototype, 'start').mockResolvedValue(undefined);
        const service = new DeploymentService(credentialService, deploymentRepository);
        const result = yield service.deploy('org-1', 'Post startup updates in r/startups every 2 hours', ['cred-1'], [], false);
        expect(result.dryRun).toBe(false);
        expect(result.deploymentId).toBe('dep-1');
        expect(result.started).toBe(1);
        expect(result.failed).toHaveLength(0);
        expect(deploymentRepository.createDeployment).toHaveBeenCalledTimes(1);
        expect(deploymentRepository.createAgent).toHaveBeenCalledTimes(1);
        expect(startSpy).toHaveBeenCalledTimes(1);
        startSpy.mockRestore();
    }));
});
//# sourceMappingURL=deployment.service.test.js.map