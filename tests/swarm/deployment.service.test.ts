import { DeploymentService } from '../../libraries/nestjs-libraries/src/swarm/deployment.service';
import { SimpleAgent } from '../../libraries/nestjs-libraries/src/swarm/simple.agent';
import { BasePlatformClient, Mention, SearchResult, SessionData } from '../../libraries/nestjs-libraries/src/swarm/platform-clients/base.client';

class FakeClient extends BasePlatformClient {
  constructor(platform: string) {
    super(platform);
  }

  async login(_username: string, _password: string): Promise<SessionData> {
    throw new Error('not needed in tests');
  }

  async post(_text: string) {
    return { success: true, id: 'post-1' };
  }

  async searchPosts(_query: string, _limit = 10): Promise<SearchResult[]> {
    return [];
  }

  async comment(_postId: string, _text: string) {
    return { success: true, id: 'comment-1' };
  }

  async like(_postId: string) {
    return { success: true, id: 'like-1' };
  }

  async getMentions(_limit = 25): Promise<Mention[]> {
    return [];
  }

  async reply(_mentionId: string, _text: string) {
    return { success: true, id: 'reply-1' };
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
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('runs dry-run planning without creating deployment records', async () => {
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

    const service = new DeploymentService(
      credentialService as any,
      deploymentRepository as any,
    );

    const result = await service.deploy(
      'org-1',
      'Post updates about AI every 2 hours',
      ['cred-1'],
      [],
      true,
    );

    expect(result.dryRun).toBe(true);
    expect(result.deploymentId).toBeNull();
    expect(result.started).toBe(0);
    expect(result.plannedTasks).toHaveLength(1);
    expect(result.validationErrors).toHaveLength(0);
    expect(result.plannedTasks[0].tasks.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ').toLowerCase()).toContain('fallback');
    expect(deploymentRepository.createDeployment).not.toHaveBeenCalled();
    expect(deploymentRepository.createAgent).not.toHaveBeenCalled();
  });

  it('honors an explicit subagent count during dry-run planning', async () => {
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

    const service = new DeploymentService(
      credentialService as any,
      deploymentRepository as any,
    );

    const result = await service.deploy(
      'org-1',
      'Fork yourself into 4 subagents and post startup updates in r/startups every 2 hours',
      ['cred-1'],
      [],
      true,
      4,
    );

    expect(result.requestedSubagentCount).toBe(4);
    expect(result.plannedTasks).toHaveLength(1);
    expect(result.plannedTasks[0].requestedSubagentCount).toBe(4);
    expect(result.plannedTasks[0].tasks).toHaveLength(4);
    expect(result.warnings.join(' ').toLowerCase()).toContain('expanded');
    expect(deploymentRepository.createDeployment).not.toHaveBeenCalled();
    expect(deploymentRepository.createAgent).not.toHaveBeenCalled();
  });

  it('fails fast when the planner produces no runnable tasks', async () => {
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
    } as any);

    const startSpy = jest.spyOn(SimpleAgent.prototype, 'start').mockResolvedValue(undefined);

    try {
      const service = new DeploymentService(
        credentialService as any,
        deploymentRepository as any,
      );

      const result = await service.deploy(
        'org-1',
        'fork yourself into 10 subagents',
        ['cred-1'],
        [],
        false,
      );

      expect(result.started).toBe(0);
      expect(result.failed[0]).toContain('no runnable tasks');
      expect(result.validationErrors[0]).toContain('no runnable tasks');
      expect(deploymentRepository.createAgent).not.toHaveBeenCalled();
      expect(startSpy).not.toHaveBeenCalled();
    } finally {
      previewSpy.mockRestore();
      startSpy.mockRestore();
    }
  });

  it('creates deployment and starts agent when plan is valid', async () => {
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

    const service = new DeploymentService(
      credentialService as any,
      deploymentRepository as any,
    );

    const result = await service.deploy(
      'org-1',
      'Post startup updates in r/startups every 2 hours',
      ['cred-1'],
      [],
      false,
    );

    expect(result.dryRun).toBe(false);
    expect(result.deploymentId).toBe('dep-1');
    expect(result.started).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(deploymentRepository.createDeployment).toHaveBeenCalledTimes(1);
    expect(deploymentRepository.createAgent).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);

    startSpy.mockRestore();
  });
});
