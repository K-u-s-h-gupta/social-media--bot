import { __awaiter, __decorate, __metadata } from "tslib";
import { Injectable } from '@nestjs/common';
import { PrismaRepository } from "../database/prisma/prisma.service";
let DeploymentRepository = class DeploymentRepository {
    constructor(_db) {
        this._db = _db;
    }
    // ─── Deployments ────────────────────────────────────────────────────────────
    createDeployment(organizationId, prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeployment.create({
                data: { organizationId, prompt, status: 'running' },
            });
        });
    }
    getDeployments(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeployment.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                include: { agents: { include: { credential: { select: { username: true, platform: true, name: true } } } } },
            });
        });
    }
    getDeployment(id, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeployment.findFirst({
                where: { id, organizationId },
                include: { agents: { include: { credential: { select: { username: true, platform: true, name: true } } } } },
            });
        });
    }
    updateDeploymentStatus(id, status, stoppedAt) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeployment.updateMany({
                where: { id },
                data: Object.assign({ status }, (stoppedAt ? { stoppedAt } : {})),
            });
        });
    }
    // ─── Agents ─────────────────────────────────────────────────────────────────
    createAgent(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeploymentAgent.create({
                data: Object.assign(Object.assign({}, data), { status: 'running' }),
            });
        });
    }
    updateAgentStatus(id, status, lastActionAt, errorMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeploymentAgent.updateMany({
                where: { id },
                data: Object.assign(Object.assign({ status }, (lastActionAt !== undefined ? { lastActionAt } : {})), (errorMessage !== undefined ? { errorMessage } : {})),
            });
        });
    }
    getAgentsByDeployment(deploymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeploymentAgent.findMany({
                where: { deploymentId },
            });
        });
    }
    getAgentsByCredential(credentialId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeploymentAgent.findMany({
                where: { credentialId, status: 'running' },
            });
        });
    }
    markAllAgentsStopped(deploymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._db.model.swarmDeploymentAgent.updateMany({
                where: { deploymentId },
                data: { status: 'stopped' },
            });
        });
    }
    markStaleDeploymentsAsStopped() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            yield this._db.model.swarmDeploymentAgent.updateMany({
                where: { status: 'running' },
                data: { status: 'stopped', errorMessage: 'Stopped: server restarted' },
            });
            yield this._db.model.swarmDeployment.updateMany({
                where: { status: 'running' },
                data: { status: 'stopped', stoppedAt: now },
            });
        });
    }
};
DeploymentRepository = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaRepository])
], DeploymentRepository);
export { DeploymentRepository };
//# sourceMappingURL=deployment.repository.js.map