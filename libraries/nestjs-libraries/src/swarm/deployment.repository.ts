import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class DeploymentRepository {
  constructor(
    private readonly _db: PrismaRepository<
      'swarmDeployment' | 'swarmDeploymentAgent'
    >,
  ) {}

  // ─── Deployments ────────────────────────────────────────────────────────────

  async createDeployment(organizationId: string, prompt: string) {
    return this._db.model.swarmDeployment.create({
      data: { organizationId, prompt, status: 'running' },
    });
  }

  async getDeployments(organizationId: string) {
    return this._db.model.swarmDeployment.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { agents: { include: { credential: { select: { username: true, platform: true, name: true } } } } },
    });
  }

  async getDeployment(id: string, organizationId: string) {
    return this._db.model.swarmDeployment.findFirst({
      where: { id, organizationId },
      include: { agents: { include: { credential: { select: { username: true, platform: true, name: true } } } } },
    });
  }

  async updateDeploymentStatus(
    id: string,
    status: string,
    stoppedAt?: Date,
  ) {
    return this._db.model.swarmDeployment.updateMany({
      where: { id },
      data: { status, ...(stoppedAt ? { stoppedAt } : {}) },
    });
  }

  // ─── Agents ─────────────────────────────────────────────────────────────────

  async createAgent(data: {
    deploymentId: string;
    credentialId: string;
    platform: string;
    username: string;
  }) {
    return this._db.model.swarmDeploymentAgent.create({
      data: { ...data, status: 'running' },
    });
  }

  async updateAgentStatus(
    id: string,
    status: string,
    lastActionAt?: Date | null,
    errorMessage?: string | null,
  ) {
    return this._db.model.swarmDeploymentAgent.updateMany({
      where: { id },
      data: {
        status,
        ...(lastActionAt !== undefined ? { lastActionAt } : {}),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      },
    });
  }

  async getAgentsByDeployment(deploymentId: string) {
    return this._db.model.swarmDeploymentAgent.findMany({
      where: { deploymentId },
    });
  }

  async getAgentsByCredential(credentialId: string) {
    return this._db.model.swarmDeploymentAgent.findMany({
      where: { credentialId, status: 'running' },
    });
  }

  async markAllAgentsStopped(deploymentId: string) {
    return this._db.model.swarmDeploymentAgent.updateMany({
      where: { deploymentId },
      data: { status: 'stopped' },
    });
  }

  async markStaleDeploymentsAsStopped() {
    const now = new Date();
    await this._db.model.swarmDeploymentAgent.updateMany({
      where: { status: 'running' },
      data: { status: 'stopped', errorMessage: 'Stopped: server restarted' },
    });
    await this._db.model.swarmDeployment.updateMany({
      where: { status: 'running' },
      data: { status: 'stopped', stoppedAt: now },
    });
  }
}
