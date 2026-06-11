var DeploymentService_1;
import { __awaiter, __decorate, __metadata } from "tslib";
import { Injectable, Logger } from '@nestjs/common';
import { CredentialService } from './credential.service';
import { DeploymentRepository } from './deployment.repository';
import { ioRedis } from "../redis/redis.service";
import { SimpleAgent } from './simple.agent';
import { getPlatformCapabilities } from './platform-capabilities';
import { SUPPORTED_PLATFORMS } from './platform-clients/client.factory';
let DeploymentService = DeploymentService_1 = class DeploymentService {
    constructor(_credentialService, _deploymentRepository) {
        this._credentialService = _credentialService;
        this._deploymentRepository = _deploymentRepository;
        this.logger = new Logger(DeploymentService_1.name);
        // Active in-process agents keyed by agentId (SwarmDeploymentAgent.id).
        this.agents = new Map();
    }
    onModuleInit() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this._deploymentRepository.markStaleDeploymentsAsStopped();
                this.logger.log('Marked stale deployments as stopped on startup');
            }
            catch (err) {
                this.logger.warn(`Failed to clean up stale deployments: ${err.message}`);
            }
        });
    }
    onModuleDestroy() {
        for (const [, agent] of this.agents) {
            agent.stop();
        }
        this.agents.clear();
    }
    deploy(orgId_1, prompt_1, credentialIds_1) {
        return __awaiter(this, arguments, void 0, function* (orgId, prompt, credentialIds, attachments = [], dryRun = false, subagentCount) {
            var _a;
            if (!credentialIds.length)
                throw new Error('No credentials selected');
            const requestedSubagentCount = this.resolveRequestedSubagentCount(prompt, subagentCount);
            const preparedPrompt = this.attachFilesContextToPrompt(prompt, attachments, requestedSubagentCount);
            const credentials = yield this._credentialService.listCredentials(orgId);
            const credentialsById = new Map(credentials.map((cred) => [cred.id, cred]));
            const failed = [];
            const warnings = [];
            const validationErrors = [];
            const plannedTasks = [];
            let started = 0;
            let deploymentId = null;
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
                    const client = yield this._credentialService.getClient(credentialId, orgId);
                    const planner = new SimpleAgent(`preview-${credentialId}`, deploymentId || 'dry-run', credentialId, cred.platform, cred.username, preparedPrompt, client, orgId);
                    const preview = yield planner.previewPlan();
                    plannedTasks.push({
                        credentialId,
                        platform: cred.platform,
                        username: cred.username,
                        displayName: cred.name || cred.username,
                        source: preview.source,
                        requestedSubagentCount: (_a = preview.requestedSubagentCount) !== null && _a !== void 0 ? _a : requestedSubagentCount,
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
                        const deployment = yield this._deploymentRepository.createDeployment(orgId, prompt);
                        deploymentId = deployment.id;
                    }
                    if (!deploymentId) {
                        throw new Error('Deployment id missing while starting agents');
                    }
                    const agentRecord = yield this._deploymentRepository.createAgent({
                        deploymentId,
                        credentialId,
                        platform: cred.platform,
                        username: cred.username,
                    });
                    const runtimeAgent = new SimpleAgent(agentRecord.id, deploymentId, credentialId, cred.platform, cred.username, preparedPrompt, client, orgId, (agentId, status, lastActionAt, errorMessage) => __awaiter(this, void 0, void 0, function* () {
                        yield this._deploymentRepository.updateAgentStatus(agentId, status, lastActionAt, errorMessage);
                    }), preview.tasks);
                    this.agents.set(agentRecord.id, runtimeAgent);
                    runtimeAgent.start().catch((err) => {
                        this.logger.error(`Agent ${agentRecord.id} start error: ${err.message}`);
                    });
                    started++;
                    this.logger.log(`Started agent ${agentRecord.id} for ${cred.platform}/${cred.username}`);
                }
                catch (err) {
                    const message = (err === null || err === void 0 ? void 0 : err.message) || 'unknown error';
                    this.logger.error(`Failed to start agent for ${credentialId}: ${message}`);
                    failed.push(`${credentialId}: ${message}`);
                }
            }
            if (!dryRun && deploymentId && started === 0) {
                yield this._deploymentRepository.updateDeploymentStatus(deploymentId, 'stopped', new Date());
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
        });
    }
    attachFilesContextToPrompt(prompt, attachments, _requestedSubagentCount) {
        const parts = [prompt.trim()];
        if (attachments.length) {
            const lines = attachments.map((attachment, index) => {
                const details = [];
                if (attachment.type)
                    details.push(attachment.type);
                if (attachment.mimeType)
                    details.push(attachment.mimeType);
                if (typeof attachment.size === 'number')
                    details.push(`${attachment.size} bytes`);
                const detailText = details.length ? ` [${details.join(', ')}]` : '';
                return `${index + 1}. ${attachment.name}${detailText} - ${attachment.url}`;
            });
            parts.push('Attached files:', lines.join('\n'));
            parts.push('Use the attached files as extra context when planning and writing content.');
        }
        return parts.filter(Boolean).join('\n\n');
    }
    resolveRequestedSubagentCount(prompt, subagentCount) {
        const explicit = this.normalizeRequestedSubagentCount(subagentCount);
        if (explicit) {
            return explicit;
        }
        return this.extractRequestedSubagentCount(prompt);
    }
    normalizeRequestedSubagentCount(value) {
        if (value === null || value === undefined)
            return null;
        if (!Number.isFinite(value))
            return null;
        const normalized = Math.round(value);
        if (normalized < 1)
            return null;
        return normalized;
    }
    extractRequestedSubagentCount(text) {
        const patterns = [
            /\b(?:fork|spawn|create|make|build|launch|run)\s+(?:yourself\s+)?(?:into\s+)?(\d{1,2})\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/i,
            /\b(\d{1,2})\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/i,
            /\b(?:sub[- ]?agents?|agents?|workers?)\s*(?:x|:|=)\s*(\d{1,2})\b/i,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match === null || match === void 0 ? void 0 : match[1]) {
                const normalized = this.normalizeRequestedSubagentCount(Number(match[1]));
                if (normalized)
                    return normalized;
            }
        }
        return null;
    }
    stopDeployment(deploymentId, orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            const deployment = yield this._deploymentRepository.getDeployment(deploymentId, orgId);
            if (!deployment)
                return;
            for (const agentRecord of deployment.agents) {
                const agent = this.agents.get(agentRecord.id);
                if (agent) {
                    agent.stop();
                    this.agents.delete(agentRecord.id);
                }
            }
            yield this._deploymentRepository.markAllAgentsStopped(deploymentId);
            yield this._deploymentRepository.updateDeploymentStatus(deploymentId, 'stopped', new Date());
            this.logger.log(`Stopped deployment ${deploymentId}`);
        });
    }
    pauseDeployment(deploymentId, orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            const deployment = yield this._deploymentRepository.getDeployment(deploymentId, orgId);
            if (!deployment)
                return;
            for (const agentRecord of deployment.agents) {
                const agent = this.agents.get(agentRecord.id);
                if (agent) {
                    agent.pause();
                    yield this._deploymentRepository.updateAgentStatus(agentRecord.id, 'paused');
                }
            }
        });
    }
    resumeDeployment(deploymentId, orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            const deployment = yield this._deploymentRepository.getDeployment(deploymentId, orgId);
            if (!deployment)
                return;
            for (const agentRecord of deployment.agents) {
                const agent = this.agents.get(agentRecord.id);
                if (agent) {
                    agent.resume();
                    yield this._deploymentRepository.updateAgentStatus(agentRecord.id, 'running');
                }
            }
        });
    }
    stopAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.stop();
            this.agents.delete(agentId);
            this._deploymentRepository.updateAgentStatus(agentId, 'stopped');
        }
    }
    pauseAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.pause();
            this._deploymentRepository.updateAgentStatus(agentId, 'paused');
        }
    }
    resumeAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.resume();
            this._deploymentRepository.updateAgentStatus(agentId, 'running');
        }
    }
    stopAgentsForCredential(orgId, credentialId) {
        return __awaiter(this, void 0, void 0, function* () {
            const agentRecords = yield this._deploymentRepository.getAgentsByCredential(credentialId);
            for (const record of agentRecords) {
                const agent = this.agents.get(record.id);
                if (agent) {
                    agent.stop();
                    this.agents.delete(record.id);
                }
                yield this._deploymentRepository.updateAgentStatus(record.id, 'stopped');
            }
        });
    }
    getDeployments(orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            const deployments = yield this._deploymentRepository.getDeployments(orgId);
            return deployments.map((deployment) => {
                const agents = deployment.agents.map((agentRecord) => {
                    var _a, _b, _c;
                    const liveAgent = this.agents.get(agentRecord.id);
                    const liveLastAction = (_a = liveAgent === null || liveAgent === void 0 ? void 0 : liveAgent.lastActionAt) !== null && _a !== void 0 ? _a : agentRecord.lastActionAt;
                    const liveError = (_b = liveAgent === null || liveAgent === void 0 ? void 0 : liveAgent.errorMessage) !== null && _b !== void 0 ? _b : agentRecord.errorMessage;
                    // If DB says running but no live agent exists, it's stale
                    const liveStatus = liveAgent
                        ? liveAgent.status
                        : agentRecord.status === 'running' ? 'stopped' : agentRecord.status;
                    return {
                        id: agentRecord.id,
                        credentialId: agentRecord.credentialId,
                        platform: agentRecord.platform,
                        username: agentRecord.username,
                        displayName: ((_c = agentRecord.credential) === null || _c === void 0 ? void 0 : _c.name) || agentRecord.username,
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
        });
    }
    getLogs(orgId_1) {
        return __awaiter(this, arguments, void 0, function* (orgId, count = 200) {
            try {
                const key = `swarm:deploy:logs:${orgId}`;
                const raw = yield ioRedis.lrange(key, 0, count - 1);
                return raw
                    .map((item) => {
                    try {
                        return JSON.parse(item);
                    }
                    catch (_a) {
                        return null;
                    }
                })
                    .filter(Boolean);
            }
            catch (_a) {
                return [];
            }
        });
    }
};
DeploymentService = DeploymentService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [CredentialService,
        DeploymentRepository])
], DeploymentService);
export { DeploymentService };
//# sourceMappingURL=deployment.service.js.map