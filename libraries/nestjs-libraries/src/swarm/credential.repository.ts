import { Injectable } from '@nestjs/common';
import { PrismaRepository, PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class CredentialRepository {
  constructor(
    private readonly _credential: PrismaRepository<'swarmCredential'>,
    private readonly _prisma: PrismaService,
  ) {}

  async findAll(organizationId: string) {
    return this._credential.model.swarmCredential.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, organizationId: string) {
    return this._credential.model.swarmCredential.findFirst({
      where: { id, organizationId },
    });
  }

  async findByPlatform(organizationId: string, platform: string) {
    return this._credential.model.swarmCredential.findMany({
      where: { organizationId, platform, enabled: true },
    });
  }

  async findOne(organizationId: string, platform: string, username: string) {
    return this._credential.model.swarmCredential.findFirst({
      where: { organizationId, platform, username },
    });
  }

  async create(data: {
    organizationId: string;
    platform: string;
    username: string;
    passwordEnc: string;
    name?: string;
  }) {
    return this._credential.model.swarmCredential.create({ data });
  }

  async updateName(id: string, organizationId: string, name: string) {
    return this._credential.model.swarmCredential.updateMany({
      where: { id, organizationId },
      data: { name },
    });
  }

  async updateSession(
    id: string,
    sessionToken: string | null,
    sessionExpiry: Date | null,
    sessionData: any,
    lastLoginAt: Date,
    loginError?: string | null,
  ) {
    return this._credential.model.swarmCredential.update({
      where: { id },
      data: {
        sessionToken,
        sessionExpiry,
        sessionData,
        lastLoginAt,
        loginError: loginError ?? null,
      },
    });
  }

  async setEnabled(id: string, organizationId: string, enabled: boolean) {
    return this._credential.model.swarmCredential.updateMany({
      where: { id, organizationId },
      data: { enabled },
    });
  }

  async delete(id: string, organizationId: string) {
    // First, delete all deployment agents referencing this credential
    // to avoid foreign key constraint violations
    await this._prisma.swarmDeploymentAgent.deleteMany({
      where: { credentialId: id },
    });
    
    // Delete any action logs referencing this credential
    await this._prisma.swarmActionLog.deleteMany({
      where: { credentialId: id },
    });
    
    // Now delete the credential
    return this._prisma.swarmCredential.deleteMany({
      where: { id, organizationId },
    });
  }

  async markLoginError(id: string, error: string) {
    return this._credential.model.swarmCredential.update({
      where: { id },
      data: { loginError: error, enabled: false },
    });
  }
}
