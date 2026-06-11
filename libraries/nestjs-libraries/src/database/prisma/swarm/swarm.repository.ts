import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SwarmRepository {
  constructor(
    private _swarmConfig: PrismaRepository<'swarmConfig'>,
    private _swarmLog: PrismaRepository<'swarmLog'>,
  ) {}

  async saveConfig(orgId: string, config: any) {
    return this._swarmConfig.model.swarmConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        config: config as any,
        status: 'running',
      },
      update: {
        config: config as any,
        status: 'running',
      },
    });
  }

  async getConfig(orgId: string) {
    const record = await this._swarmConfig.model.swarmConfig.findUnique({
      where: { organizationId: orgId },
    });
    return record ? (record.config as any) : null;
  }

  async setStatus(orgId: string, status: string) {
    return this._swarmConfig.model.swarmConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        config: {},
        status,
      },
      update: { status },
    });
  }

  async getStatus(orgId: string): Promise<string> {
    const record = await this._swarmConfig.model.swarmConfig.findUnique({
      where: { organizationId: orgId },
    });
    return record?.status ?? 'stopped';
  }

  async deleteConfig(orgId: string) {
    try {
      await this._swarmConfig.model.swarmConfig.delete({
        where: { organizationId: orgId },
      });
    } catch {
      // Record may not exist - ignore
    }
  }

  async appendLog(orgId: string, message: string) {
    return this._swarmLog.model.swarmLog.create({
      data: {
        organizationId: orgId,
        message,
      },
    });
  }

  async getLogs(orgId: string, count = 50) {
    const records = await this._swarmLog.model.swarmLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: count,
    });
    return records.map((r) => r.message);
  }

  async pruneLogs(orgId: string, keepCount = 500) {
    const records = await this._swarmLog.model.swarmLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      skip: keepCount,
      select: { id: true },
    });
    if (records.length === 0) return undefined;
    return this._swarmLog.model.swarmLog.deleteMany({
      where: { id: { in: records.map((r) => r.id) } },
    });
  }
}
