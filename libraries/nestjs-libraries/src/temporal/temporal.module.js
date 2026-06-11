import { __awaiter, __decorate } from "tslib";
import { Module, Global, Injectable, Logger } from '@nestjs/common';
// Safely import TemporalService class for DI token — avoid pulling native Temporal SDK at top level
let TemporalServiceClass;
try {
    TemporalServiceClass = require('nestjs-temporal-core').TemporalService;
}
catch (_e) {
    // If nestjs-temporal-core can't be loaded, create a placeholder class token
    TemporalServiceClass = class TemporalService {
    };
}
/**
 * Stub TemporalService when Temporal is disabled.
 * Provides the same injectable token (TemporalService class) so DI doesn't break.
 */
let TemporalServiceStub = class TemporalServiceStub {
    constructor() {
        this.logger = new Logger('TemporalServiceStub');
    }
    startWorkflow(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.warn('Temporal disabled — startWorkflow is a no-op');
            return { workflowId: 'disabled', runId: 'disabled' };
        });
    }
    signalWorkflow(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.warn('Temporal disabled — signalWorkflow is a no-op');
        });
    }
    terminateWorkflow(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            this.logger.warn('Temporal disabled — terminateWorkflow is a no-op');
        });
    }
    queryWorkflow(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
    getClient() {
        return null;
    }
    /** Mimics the real TemporalService.client getter so services that access .client.getRawClient() don't crash */
    get client() {
        return {
            getRawClient: () => null,
            isHealthy: () => false,
        };
    }
};
TemporalServiceStub = __decorate([
    Injectable()
], TemporalServiceStub);
let TemporalStubModule = class TemporalStubModule {
};
TemporalStubModule = __decorate([
    Global(),
    Module({
        providers: [
            {
                provide: TemporalServiceClass,
                useClass: TemporalServiceStub,
            },
        ],
        exports: [TemporalServiceClass],
    })
], TemporalStubModule);
export const getTemporalModule = (isWorkers, path, activityClasses) => {
    // If Temporal is disabled, return a stub module that provides a no-op TemporalService
    if (process.env.DISABLE_TEMPORAL_INIT === 'true') {
        return TemporalStubModule;
    }
    // Otherwise use real Temporal
    const { TemporalModule } = require('nestjs-temporal-core');
    return TemporalModule.register(Object.assign({ isGlobal: true, connection: Object.assign(Object.assign(Object.assign({ address: process.env.TEMPORAL_ADDRESS || 'localhost:7233' }, process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}), process.env.TEMPORAL_API_KEY ? { apiKey: process.env.TEMPORAL_API_KEY } : {}), { namespace: process.env.TEMPORAL_NAMESPACE || 'default' }), taskQueue: 'main', logLevel: 'error' }, (isWorkers
        ? {
            workers: [
                {
                    taskQueue: 'main',
                    workflowsPath: path,
                    activityClasses: activityClasses,
                    autoStart: true,
                },
            ],
        }
        : {})));
};
//# sourceMappingURL=temporal.module.js.map