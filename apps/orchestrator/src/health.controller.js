import { __awaiter, __decorate, __metadata, __param } from "tslib";
import { Controller, Get, Res } from '@nestjs/common';
import { Connection } from '@temporalio/client';
let HealthController = class HealthController {
    getHealthStatus(res) {
        return __awaiter(this, void 0, void 0, function* () {
            let connection;
            try {
                const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
                connection = yield Connection.connect(Object.assign(Object.assign({ address }, (process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {})), (process.env.TEMPORAL_API_KEY
                    ? { apiKey: process.env.TEMPORAL_API_KEY }
                    : {})));
                const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
                yield Promise.race([
                    connection.workflowService.describeNamespace({ namespace }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
                ]);
                return res.status(200).json({ status: 'ok' });
            }
            catch (_a) {
                return res.status(500).json({ status: 'error' });
            }
            finally {
                yield (connection === null || connection === void 0 ? void 0 : connection.close().catch(() => { }));
            }
        });
    }
};
__decorate([
    Get('/status'),
    __param(0, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "getHealthStatus", null);
HealthController = __decorate([
    Controller('health')
], HealthController);
export { HealthController };
//# sourceMappingURL=health.controller.js.map