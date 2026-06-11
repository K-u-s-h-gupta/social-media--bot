import { __awaiter, __decorate, __metadata } from "tslib";
import { Injectable } from '@nestjs/common';
import { PrismaRepository, PrismaService } from "../database/prisma/prisma.service";
let CredentialRepository = class CredentialRepository {
    constructor(_credential, _prisma) {
        this._credential = _credential;
        this._prisma = _prisma;
    }
    findAll(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
            });
        });
    }
    findById(id, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.findFirst({
                where: { id, organizationId },
            });
        });
    }
    findByPlatform(organizationId, platform) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.findMany({
                where: { organizationId, platform, enabled: true },
            });
        });
    }
    findOne(organizationId, platform, username) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.findFirst({
                where: { organizationId, platform, username },
            });
        });
    }
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.create({ data });
        });
    }
    updateName(id, organizationId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.updateMany({
                where: { id, organizationId },
                data: { name },
            });
        });
    }
    updateSession(id, sessionToken, sessionExpiry, sessionData, lastLoginAt, loginError) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.update({
                where: { id },
                data: {
                    sessionToken,
                    sessionExpiry,
                    sessionData,
                    lastLoginAt,
                    loginError: loginError !== null && loginError !== void 0 ? loginError : null,
                },
            });
        });
    }
    setEnabled(id, organizationId, enabled) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.updateMany({
                where: { id, organizationId },
                data: { enabled },
            });
        });
    }
    delete(id, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            // First, delete all deployment agents referencing this credential
            // to avoid foreign key constraint violations
            yield this._prisma.swarmDeploymentAgent.deleteMany({
                where: { credentialId: id },
            });
            // Delete any action logs referencing this credential
            yield this._prisma.swarmActionLog.deleteMany({
                where: { credentialId: id },
            });
            // Now delete the credential
            return this._prisma.swarmCredential.deleteMany({
                where: { id, organizationId },
            });
        });
    }
    markLoginError(id, error) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._credential.model.swarmCredential.update({
                where: { id },
                data: { loginError: error, enabled: false },
            });
        });
    }
};
CredentialRepository = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaRepository,
        PrismaService])
], CredentialRepository);
export { CredentialRepository };
//# sourceMappingURL=credential.repository.js.map