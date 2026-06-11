import { __awaiter, __decorate, __metadata, __param } from "tslib";
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UploadedFile, UseInterceptors, } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CredentialService } from "../../../../../libraries/nestjs-libraries/src/swarm/credential.service";
import { DeploymentService } from "../../../../../libraries/nestjs-libraries/src/swarm/deployment.service";
import { AttachmentService } from "../../../../../libraries/nestjs-libraries/src/swarm/attachment.service";
import { GetOrgFromRequest } from "../../../../../libraries/nestjs-libraries/src/user/org.from.request";
import { SUPPORTED_PLATFORMS } from "../../../../../libraries/nestjs-libraries/src/swarm/platform-clients/client.factory";
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
let SwarmController = class SwarmController {
    constructor(_credentialService, _deploymentService, _attachmentService) {
        this._credentialService = _credentialService;
        this._deploymentService = _deploymentService;
        this._attachmentService = _attachmentService;
    }
    getPlatforms() {
        return { platforms: SUPPORTED_PLATFORMS };
    }
    addCredential(org, body) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const credential = yield this._credentialService.addCredential(org.id, body.platform, body.username, body.password, body.name);
            return {
                id: credential.id,
                platform: credential.platform,
                username: credential.username,
                name: (_a = credential.name) !== null && _a !== void 0 ? _a : null,
                enabled: credential.enabled,
                createdAt: credential.createdAt,
            };
        });
    }
    listCredentials(org) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credentialService.listCredentials(org.id);
        });
    }
    renameCredential(org, id, body) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._credentialService.updateCredentialName(id, org.id, body.name);
            return { status: 'renamed' };
        });
    }
    removeCredential(org, credentialId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._deploymentService.stopAgentsForCredential(org.id, credentialId);
            yield this._credentialService.removeCredential(credentialId, org.id);
            return { status: 'deleted' };
        });
    }
    toggleCredential(org, credentialId, body) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._credentialService.toggleCredential(credentialId, org.id, body.enabled);
            if (!body.enabled) {
                yield this._deploymentService.stopAgentsForCredential(org.id, credentialId);
            }
            return { status: body.enabled ? 'enabled' : 'disabled' };
        });
    }
    deploy(org, body) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!((_a = body.prompt) === null || _a === void 0 ? void 0 : _a.trim())) {
                return { error: 'Prompt is required' };
            }
            if (!((_b = body.credentialIds) === null || _b === void 0 ? void 0 : _b.length)) {
                return { error: 'Select at least one account' };
            }
            return this._deploymentService.deploy(org.id, body.prompt, body.credentialIds, body.attachments || [], !!body.dryRun, body.subagentCount);
        });
    }
    uploadAttachment(org, file) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!file) {
                throw new BadRequestException('File is required');
            }
            return this._attachmentService.uploadAttachment(org.id, file);
        });
    }
    deleteAttachment(org, body) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!body.path) {
                throw new BadRequestException('Attachment path is required');
            }
            yield this._attachmentService.deleteAttachment(org.id, body.path);
            return { status: 'deleted' };
        });
    }
    getDeployments(org) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._deploymentService.getDeployments(org.id);
        });
    }
    stopDeployment(org, deploymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._deploymentService.stopDeployment(deploymentId, org.id);
            return { status: 'stopped' };
        });
    }
    pauseDeployment(org, deploymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._deploymentService.pauseDeployment(deploymentId, org.id);
            return { status: 'paused' };
        });
    }
    resumeDeployment(org, deploymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._deploymentService.resumeDeployment(deploymentId, org.id);
            return { status: 'resumed' };
        });
    }
    stopAgent(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._deploymentService.stopAgent(agentId);
            return { status: 'stopped' };
        });
    }
    pauseAgent(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._deploymentService.pauseAgent(agentId);
            return { status: 'paused' };
        });
    }
    resumeAgent(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._deploymentService.resumeAgent(agentId);
            return { status: 'resumed' };
        });
    }
    getLogs(org, count) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._deploymentService.getLogs(org.id, count ? parseInt(count, 10) : 200);
        });
    }
};
__decorate([
    Get('/platforms'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SwarmController.prototype, "getPlatforms", null);
__decorate([
    Post('/credentials'),
    __param(0, GetOrgFromRequest()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "addCredential", null);
__decorate([
    Get('/credentials'),
    __param(0, GetOrgFromRequest()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "listCredentials", null);
__decorate([
    Put('/credentials/:id/name'),
    __param(0, GetOrgFromRequest()),
    __param(1, Param('id')),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "renameCredential", null);
__decorate([
    Delete('/credentials/:id'),
    __param(0, GetOrgFromRequest()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "removeCredential", null);
__decorate([
    Put('/credentials/:id/toggle'),
    __param(0, GetOrgFromRequest()),
    __param(1, Param('id')),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "toggleCredential", null);
__decorate([
    Post('/deploy'),
    __param(0, GetOrgFromRequest()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "deploy", null);
__decorate([
    Post('/attachments/upload'),
    UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: {
            fileSize: Number(process.env.SWARM_ATTACHMENT_MAX_BYTES || 50 * 1024 * 1024),
        },
    })),
    __param(0, GetOrgFromRequest()),
    __param(1, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "uploadAttachment", null);
__decorate([
    Post('/attachments/delete'),
    HttpCode(HttpStatus.OK),
    __param(0, GetOrgFromRequest()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "deleteAttachment", null);
__decorate([
    Get('/deployments'),
    __param(0, GetOrgFromRequest()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "getDeployments", null);
__decorate([
    Delete('/deployments/:id'),
    __param(0, GetOrgFromRequest()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "stopDeployment", null);
__decorate([
    Post('/deployments/:id/pause'),
    __param(0, GetOrgFromRequest()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "pauseDeployment", null);
__decorate([
    Post('/deployments/:id/resume'),
    __param(0, GetOrgFromRequest()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "resumeDeployment", null);
__decorate([
    Delete('/deployments/:deploymentId/agents/:agentId'),
    __param(0, Param('agentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "stopAgent", null);
__decorate([
    Post('/deployments/:deploymentId/agents/:agentId/pause'),
    __param(0, Param('agentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "pauseAgent", null);
__decorate([
    Post('/deployments/:deploymentId/agents/:agentId/resume'),
    __param(0, Param('agentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "resumeAgent", null);
__decorate([
    Get('/logs'),
    __param(0, GetOrgFromRequest()),
    __param(1, Query('count')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SwarmController.prototype, "getLogs", null);
SwarmController = __decorate([
    ApiTags('Swarm'),
    Controller('/swarm'),
    __metadata("design:paramtypes", [CredentialService,
        DeploymentService,
        AttachmentService])
], SwarmController);
export { SwarmController };
//# sourceMappingURL=swarm.controller.js.map