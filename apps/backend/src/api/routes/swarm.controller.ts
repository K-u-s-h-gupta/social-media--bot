import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CredentialService } from '@gitroom/nestjs-libraries/swarm/credential.service';
import { DeploymentService } from '@gitroom/nestjs-libraries/swarm/deployment.service';
import { AttachmentService } from '@gitroom/nestjs-libraries/swarm/attachment.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { SUPPORTED_PLATFORMS } from '@gitroom/nestjs-libraries/swarm/platform-clients/client.factory';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';

@ApiTags('Swarm')
@Controller('/swarm')
export class SwarmController {
  constructor(
    private readonly _credentialService: CredentialService,
    private readonly _deploymentService: DeploymentService,
    private readonly _attachmentService: AttachmentService,
  ) {}

  @Get('/platforms')
  getPlatforms() {
    return { platforms: SUPPORTED_PLATFORMS };
  }

  @Post('/credentials')
  async addCredential(
    @GetOrgFromRequest() org: { id: string },
    @Body()
    body: {
      platform: string;
      username: string;
      password: string;
      name?: string;
    },
  ) {
    const credential = await this._credentialService.addCredential(
      org.id,
      body.platform,
      body.username,
      body.password,
      body.name,
    );
    return {
      id: credential.id,
      platform: credential.platform,
      username: credential.username,
      name: (credential as any).name ?? null,
      enabled: credential.enabled,
      createdAt: credential.createdAt,
    };
  }

  @Get('/credentials')
  async listCredentials(@GetOrgFromRequest() org: { id: string }) {
    return this._credentialService.listCredentials(org.id);
  }

  @Put('/credentials/:id/name')
  async renameCredential(
    @GetOrgFromRequest() org: { id: string },
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    await this._credentialService.updateCredentialName(id, org.id, body.name);
    return { status: 'renamed' };
  }

  @Delete('/credentials/:id')
  async removeCredential(
    @GetOrgFromRequest() org: { id: string },
    @Param('id') credentialId: string,
  ) {
    await this._deploymentService.stopAgentsForCredential(org.id, credentialId);
    await this._credentialService.removeCredential(credentialId, org.id);
    return { status: 'deleted' };
  }

  @Put('/credentials/:id/toggle')
  async toggleCredential(
    @GetOrgFromRequest() org: { id: string },
    @Param('id') credentialId: string,
    @Body() body: { enabled: boolean },
  ) {
    await this._credentialService.toggleCredential(credentialId, org.id, body.enabled);
    if (!body.enabled) {
      await this._deploymentService.stopAgentsForCredential(org.id, credentialId);
    }
    return { status: body.enabled ? 'enabled' : 'disabled' };
  }

  @Post('/deploy')
  async deploy(
    @GetOrgFromRequest() org: { id: string },
    @Body()
    body: {
      prompt: string;
      credentialIds: string[];
      dryRun?: boolean;
      subagentCount?: number;
      attachments?: Array<{
        name: string;
        url: string;
        path?: string;
        mimeType?: string;
        size?: number;
        type?: string;
      }>;
    },
  ) {
    if (!body.prompt?.trim()) {
      return { error: 'Prompt is required' };
    }
    if (!body.credentialIds?.length) {
      return { error: 'Select at least one account' };
    }
    return this._deploymentService.deploy(
      org.id,
      body.prompt,
      body.credentialIds,
      body.attachments || [],
      !!body.dryRun,
      body.subagentCount,
    );
  }

  @Post('/attachments/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.SWARM_ATTACHMENT_MAX_BYTES || 50 * 1024 * 1024),
      },
    }),
  )
  async uploadAttachment(
    @GetOrgFromRequest() org: { id: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this._attachmentService.uploadAttachment(org.id, file);
  }

  @Post('/attachments/delete')
  @HttpCode(HttpStatus.OK)
  async deleteAttachment(
    @GetOrgFromRequest() org: { id: string },
    @Body() body: { path: string },
  ) {
    if (!body.path) {
      throw new BadRequestException('Attachment path is required');
    }
    await this._attachmentService.deleteAttachment(org.id, body.path);
    return { status: 'deleted' };
  }

  @Get('/deployments')
  async getDeployments(@GetOrgFromRequest() org: { id: string }) {
    return this._deploymentService.getDeployments(org.id);
  }

  @Delete('/deployments/:id')
  async stopDeployment(
    @GetOrgFromRequest() org: { id: string },
    @Param('id') deploymentId: string,
  ) {
    await this._deploymentService.stopDeployment(deploymentId, org.id);
    return { status: 'stopped' };
  }

  @Post('/deployments/:id/pause')
  async pauseDeployment(
    @GetOrgFromRequest() org: { id: string },
    @Param('id') deploymentId: string,
  ) {
    await this._deploymentService.pauseDeployment(deploymentId, org.id);
    return { status: 'paused' };
  }

  @Post('/deployments/:id/resume')
  async resumeDeployment(
    @GetOrgFromRequest() org: { id: string },
    @Param('id') deploymentId: string,
  ) {
    await this._deploymentService.resumeDeployment(deploymentId, org.id);
    return { status: 'resumed' };
  }

  @Delete('/deployments/:deploymentId/agents/:agentId')
  async stopAgent(
    @Param('agentId') agentId: string,
  ) {
    this._deploymentService.stopAgent(agentId);
    return { status: 'stopped' };
  }

  @Post('/deployments/:deploymentId/agents/:agentId/pause')
  async pauseAgent(
    @Param('agentId') agentId: string,
  ) {
    this._deploymentService.pauseAgent(agentId);
    return { status: 'paused' };
  }

  @Post('/deployments/:deploymentId/agents/:agentId/resume')
  async resumeAgent(
    @Param('agentId') agentId: string,
  ) {
    this._deploymentService.resumeAgent(agentId);
    return { status: 'resumed' };
  }

  @Get('/logs')
  async getLogs(
    @GetOrgFromRequest() org: { id: string },
    @Query('count') count?: string,
  ) {
    return this._deploymentService.getLogs(
      org.id,
      count ? parseInt(count, 10) : 200,
    );
  }
}
