import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CredentialService } from './credential.service';
import { DeploymentRepository } from './deployment.repository';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { AgentPlanPreview, SimpleAgent, TaskPlanSummary } from './simple.agent';
import { getPlatformCapabilities, PlatformCapabilities } from './platform-capabilities';
import { SUPPORTED_PLATFORMS } from './platform-clients/client.factory';

export interface DeploymentAttachment {
  name: string;
  url: string;
  path?: string;
  mimeType?: string;
  size?: number;
  type?: string;
}

export interface AgentPlanReport {
  credentialId: string;
  platform: string;
  username: string;
  displayName: string;
  source: AgentPlanPreview['source'];
  requestedSubagentCount: number | null;
  tasks: TaskPlanSummary[];
  warnings: string[];
  validationErrors: string[];
  capabilities: PlatformCapabilities;
}

export interface DeployResponse {
  deploymentId: string | null;
  started: number;
  failed: string[];
  dryRun: boolean;
  requestedSubagentCount: number | null;
  plannedTasks: AgentPlanReport[];
  warnings: string[];
  validationErrors: string[];
  platformCapabilities: PlatformCapabilities[];
}

@Injectable()
export class DeploymentService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(DeploymentService.name);

  // Active in-process agents keyed by agentId (SwarmDeploymentAgent.id).
  private agents = new Map<string, SimpleAgent>();

  constructor(
    private readonly _credentialService: CredentialService,
    private readonly _deploymentRepository: DeploymentRepository,
  ) {}

  async onModuleInit() {
    try {
      await this._deploymentRepository.markStaleDeploymentsAsStopped();
      this.logger.log('Marked stale deployments as stopped on startup');
    } catch (err: any) {
      this.logger.warn(`Failed to clean up stale deployments: ${err.message}`);
    }
  }

  onModuleDestroy() {
    for (const [, agent] of this.agents) {
      agent.stop();
    }
    this.agents.clear();
  }

  async deploy(
    orgId: string,
    prompt: string,
    credentialIds: string[],
    attachments: DeploymentAttachment[] = [],
    dryRun = false,
    subagentCount?: number | null,
  ): Promise<DeployResponse> {
    if (!credentialIds.length) throw new Error('No credentials selected');
    const requestedSubagentCount = this.resolveRequestedSubagentCount(prompt, subagentCount);
    const preparedPrompt = this.attachFilesContextToPrompt(prompt, attachments, requestedSubagentCount);

    const credentials = await this._credentialService.listCredentials(orgId);
    const credentialsById = new Map(credentials.map((cred) => [cred.id, cred]));

    const failed: string[] = [];
    const warnings: string[] = [];
    const validationErrors: string[] = [];
    const plannedTasks: AgentPlanReport[] = [];
    let started = 0;
    let deploymentId: string | null = null;

    for (const credentialId of credentialIds) {
      const cred = credentialsById.get(credentialId);
      if (!cred) {
        const message = `${credentialId}: credential not found`;
        failed.push(message);
        validationErrors.push(message);
        continue;
      }
      if (!cred.enabled) {
        const message = `${cred.username}: credential is disabled`;
        failed.push(message);
        validationErrors.push(message);
        continue;
      }

      const capabilities = getPlatformCapabilities(cred.platform);

      try {
        const client = await this._credentialService.getClient(credentialId, orgId);
        const planner = new SimpleAgent(
          `preview-${credentialId}`,
          deploymentId || 'dry-run',
          credentialId,
          cred.platform,
          cred.username,
          preparedPrompt,
          client,
          orgId,
        );
        const preview = await planner.previewPlan();
        plannedTasks.push({
          credentialId,
          platform: cred.platform,
          username: cred.username,
          displayName: cred.name || cred.username,
          source: preview.source,
          requestedSubagentCount: preview.requestedSubagentCount ?? requestedSubagentCount,
          tasks: preview.summary,
          warnings: preview.warnings,
          validationErrors: preview.validationErrors,
          capabilities,
        });

        for (const warning of preview.warnings) {
          warnings.push(`${cred.platform}/${cred.username}: ${warning}`);
        }
        for (const error of preview.validationErrors) {
          const fullMessage = `${cred.platform}/${cred.username}: ${error}`;
          validationErrors.push(fullMessage);
        }

        if (preview.validationErrors.length > 0) {
          failed.push(`${cred.username}: invalid instruction for selected platform`);
          continue;
        }

        if (!preview.tasks.length) {
          const message = `${cred.platform}/${cred.username}: no runnable tasks were planned for this account.`;
          warnings.push(message);
          validationErrors.push(message);
          failed.push(`${cred.username}: no runnable tasks were planned for this account`);
          continue;
        }

        if (dryRun) {
          continue;
        }

        if (!deploymentId) {
          const deployment = await this._deploymentRepository.createDeployment(orgId, prompt);
          deploymentId = deployment.id;
        }

        if (!deploymentId) {
          throw new Error('Deployment id missing while starting agents');
        }

        const agentRecord = await this._deploymentRepository.createAgent({
          deploymentId,
          credentialId,
          platform: cred.platform,
          username: cred.username,
        });

        const runtimeAgent = new SimpleAgent(
          agentRecord.id,
          deploymentId,
          credentialId,
          cred.platform,
          cred.username,
          preparedPrompt,
          client,
          orgId,
          async (agentId, status, lastActionAt, errorMessage) => {
            await this._deploymentRepository.updateAgentStatus(
              agentId,
              status,
              lastActionAt,
              errorMessage,
            );
          },
          preview.tasks,
        );

        this.agents.set(agentRecord.id, runtimeAgent);
        runtimeAgent.start().catch((err) => {
          this.logger.error(`Agent ${agentRecord.id} start error: ${err.message}`);
        });

        started++;
        this.logger.log(`Started agent ${agentRecord.id} for ${cred.platform}/${cred.username}`);
      } catch (err: any) {
        const message = err?.message || 'unknown error';
        this.logger.error(`Failed to start agent for ${credentialId}: ${message}`);
        failed.push(`${credentialId}: ${message}`);
      }
    }

    if (!dryRun && deploymentId && started === 0) {
      await this._deploymentRepository.updateDeploymentStatus(
        deploymentId,
        'stopped',
        new Date(),
      );
    }

    return {
      deploymentId,
      started,
      failed,
      dryRun,
      requestedSubagentCount,
      plannedTasks,
      warnings,
      validationErrors,
      platformCapabilities: SUPPORTED_PLATFORMS.map((p) => getPlatformCapabilities(p.id)),
    };
  }

  private attachFilesContextToPrompt(
    prompt: string,
    attachments: DeploymentAttachment[],
    _requestedSubagentCount?: number | null,
  ) {
    const parts = [prompt.trim()];

    if (attachments.length) {
      const lines = attachments.map((attachment, index) => {
        const details: string[] = [];
        if (attachment.type) details.push(attachment.type);
        if (attachment.mimeType) details.push(attachment.mimeType);
        if (typeof attachment.size === 'number') details.push(`${attachment.size} bytes`);
        const detailText = details.length ? ` [${details.join(', ')}]` : '';
        return `${index + 1}. ${attachment.name}${detailText} - ${attachment.url}`;
      });

      parts.push('Attached files:', lines.join('\n'));
      parts.push('Use the attached files as extra context when planning and writing content.');
    }

    return parts.filter(Boolean).join('\n\n');
  }

  private resolveRequestedSubagentCount(prompt: string, subagentCount?: number | null): number | null {
    const explicit = this.normalizeRequestedSubagentCount(subagentCount);
    if (explicit) {
      return explicit;
    }
    return this.extractRequestedSubagentCount(prompt);
  }

  private normalizeRequestedSubagentCount(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isFinite(value)) return null;
    const normalized = Math.round(value);
    if (normalized < 1) return null;
    return normalized;
  }

  private extractRequestedSubagentCount(text: string): number | null {
    const patterns = [
      /\b(?:fork|spawn|create|make|build|launch|run)\s+(?:yourself\s+)?(?:into\s+)?(\d{1,2})\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/i,
      /\b(\d{1,2})\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/i,
      /\b(?:sub[- ]?agents?|agents?|workers?)\s*(?:x|:|=)\s*(\d{1,2})\b/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const normalized = this.normalizeRequestedSubagentCount(Number(match[1]));
        if (normalized) return normalized;
      }
    }

    return null;
  }

  async stopDeployment(deploymentId: string, orgId: string) {
    const deployment = await this._deploymentRepository.getDeployment(
      deploymentId,
      orgId,
    );
    if (!deployment) return;

    for (const agentRecord of deployment.agents) {
      const agent = this.agents.get(agentRecord.id);
      if (agent) {
        agent.stop();
        this.agents.delete(agentRecord.id);
      }
    }

    await this._deploymentRepository.markAllAgentsStopped(deploymentId);
    await this._deploymentRepository.updateDeploymentStatus(
      deploymentId,
      'stopped',
      new Date(),
    );
    this.logger.log(`Stopped deployment ${deploymentId}`);
  }

  async pauseDeployment(deploymentId: string, orgId: string) {
    const deployment = await this._deploymentRepository.getDeployment(
      deploymentId,
      orgId,
    );
    if (!deployment) return;
    for (const agentRecord of deployment.agents) {
      const agent = this.agents.get(agentRecord.id);
      if (agent) {
        agent.pause();
        await this._deploymentRepository.updateAgentStatus(agentRecord.id, 'paused');
      }
    }
  }

  async resumeDeployment(deploymentId: string, orgId: string) {
    const deployment = await this._deploymentRepository.getDeployment(
      deploymentId,
      orgId,
    );
    if (!deployment) return;
    for (const agentRecord of deployment.agents) {
      const agent = this.agents.get(agentRecord.id);
      if (agent) {
        agent.resume();
        await this._deploymentRepository.updateAgentStatus(agentRecord.id, 'running');
      }
    }
  }

  stopAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.stop();
      this.agents.delete(agentId);
      this._deploymentRepository.updateAgentStatus(agentId, 'stopped');
    }
  }

  pauseAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.pause();
      this._deploymentRepository.updateAgentStatus(agentId, 'paused');
    }
  }

  resumeAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.resume();
      this._deploymentRepository.updateAgentStatus(agentId, 'running');
    }
  }

  async stopAgentsForCredential(orgId: string, credentialId: string) {
    const agentRecords = await this._deploymentRepository.getAgentsByCredential(credentialId);
    for (const record of agentRecords) {
      const agent = this.agents.get(record.id);
      if (agent) {
        agent.stop();
        this.agents.delete(record.id);
      }
      await this._deploymentRepository.updateAgentStatus(record.id, 'stopped');
    }
  }

  async getDeployments(orgId: string) {
    const deployments = await this._deploymentRepository.getDeployments(orgId);

    return deployments.map((deployment) => {
      const agents = deployment.agents.map((agentRecord) => {
        const liveAgent = this.agents.get(agentRecord.id);
        const liveLastAction = liveAgent?.lastActionAt ?? agentRecord.lastActionAt;
        const liveError = liveAgent?.errorMessage ?? agentRecord.errorMessage;
        // If DB says running but no live agent exists, it's stale
        const liveStatus = liveAgent
          ? liveAgent.status
          : agentRecord.status === 'running' ? 'stopped' : agentRecord.status;
        return {
          id: agentRecord.id,
          credentialId: agentRecord.credentialId,
          platform: agentRecord.platform,
          username: agentRecord.username,
          displayName: (agentRecord.credential as any)?.name || agentRecord.username,
          status: liveStatus,
          lastActionAt: liveLastAction,
          errorMessage: liveError,
          createdAt: agentRecord.createdAt,
          isLive: !!liveAgent,
        };
      });

      // If deployment says "running" but has no live agents, it's effectively stopped
      const hasLiveAgents = agents.some((a) => a.isLive);
      const effectiveStatus = deployment.status === 'running' && !hasLiveAgents && agents.length > 0
        ? 'stopped'
        : deployment.status;

      return {
        id: deployment.id,
        prompt: deployment.prompt,
        status: effectiveStatus,
        createdAt: deployment.createdAt,
        stoppedAt: deployment.stoppedAt,
        agents,
      };
    });
  }

  async getLogs(orgId: string, count = 200) {
    try {
      const key = `swarm:deploy:logs:${orgId}`;
      const raw = await ioRedis.lrange(key, 0, count - 1);
      return raw
        .map((item) => {
          try {
            return JSON.parse(item);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
