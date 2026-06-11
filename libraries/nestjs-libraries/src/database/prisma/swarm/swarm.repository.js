import { __awaiter, __decorate, __metadata } from "tslib";
import { PrismaRepository } from "../prisma.service";
import { Injectable } from '@nestjs/common';
let SwarmRepository = class SwarmRepository {
    constructor(_swarmConfig, _swarmLog) {
        this._swarmConfig = _swarmConfig;
        this._swarmLog = _swarmLog;
    }
    saveConfig(orgId, config) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._swarmConfig.model.swarmConfig.upsert({
                where: { organizationId: orgId },
                create: {
                    organizationId: orgId,
                    config: config,
                    status: 'running',
                },
                update: {
                    config: config,
                    status: 'running',
                },
            });
        });
    }
    getConfig(orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            const record = yield this._swarmConfig.model.swarmConfig.findUnique({
                where: { organizationId: orgId },
            });
            return record ? record.config : null;
        });
    }
    setStatus(orgId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._swarmConfig.model.swarmConfig.upsert({
                where: { organizationId: orgId },
                create: {
                    organizationId: orgId,
                    config: {},
                    status,
                },
                update: { status },
            });
        });
    }
    getStatus(orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const record = yield this._swarmConfig.model.swarmConfig.findUnique({
                where: { organizationId: orgId },
            });
            return (_a = record === null || record === void 0 ? void 0 : record.status) !== null && _a !== void 0 ? _a : 'stopped';
        });
    }
    deleteConfig(orgId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this._swarmConfig.model.swarmConfig.delete({
                    where: { organizationId: orgId },
                });
            }
            catch (_a) {
                // Record may not exist - ignore
            }
        });
    }
    appendLog(orgId, message) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._swarmLog.model.swarmLog.create({
                data: {
                    organizationId: orgId,
                    message,
                },
            });
        });
    }
    getLogs(orgId_1) {
        return __awaiter(this, arguments, void 0, function* (orgId, count = 50) {
            const records = yield this._swarmLog.model.swarmLog.findMany({
                where: { organizationId: orgId },
                orderBy: { createdAt: 'desc' },
                take: count,
            });
            return records.map((r) => r.message);
        });
    }
    pruneLogs(orgId_1) {
        return __awaiter(this, arguments, void 0, function* (orgId, keepCount = 500) {
            const records = yield this._swarmLog.model.swarmLog.findMany({
                where: { organizationId: orgId },
                orderBy: { createdAt: 'desc' },
                skip: keepCount,
                select: { id: true },
            });
            if (records.length === 0)
                return undefined;
            return this._swarmLog.model.swarmLog.deleteMany({
                where: { id: { in: records.map((r) => r.id) } },
            });
        });
    }
};
SwarmRepository = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [PrismaRepository,
        PrismaRepository])
], SwarmRepository);
export { SwarmRepository };
//# sourceMappingURL=swarm.repository.js.map