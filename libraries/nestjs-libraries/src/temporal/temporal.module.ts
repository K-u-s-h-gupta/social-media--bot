import { Module, Global, Injectable, Logger } from '@nestjs/common';

// Safely import TemporalService class for DI token — avoid pulling native Temporal SDK at top level
let TemporalServiceClass: any;
try {
  TemporalServiceClass = require('nestjs-temporal-core').TemporalService;
} catch (_e) {
  // If nestjs-temporal-core can't be loaded, create a placeholder class token
  TemporalServiceClass = class TemporalService {};
}

/**
 * Stub TemporalService when Temporal is disabled.
 * Provides the same injectable token (TemporalService class) so DI doesn't break.
 */
@Injectable()
class TemporalServiceStub {
  private readonly logger = new Logger('TemporalServiceStub');

  async startWorkflow(...args: any[]) {
    this.logger.warn('Temporal disabled — startWorkflow is a no-op');
    return { workflowId: 'disabled', runId: 'disabled' };
  }

  async signalWorkflow(...args: any[]) {
    this.logger.warn('Temporal disabled — signalWorkflow is a no-op');
  }

  async terminateWorkflow(...args: any[]) {
    this.logger.warn('Temporal disabled — terminateWorkflow is a no-op');
  }

  async queryWorkflow(...args: any[]) {
    return null;
  }

  getClient() {
    return null;
  }

  /** Mimics the real TemporalService.client getter so services that access .client.getRawClient() don't crash */
  get client(): any {
    return {
      getRawClient: () => null,
      isHealthy: () => false,
    };
  }
}

@Global()
@Module({
  providers: [
    {
      provide: TemporalServiceClass,
      useClass: TemporalServiceStub,
    },
  ],
  exports: [TemporalServiceClass],
})
class TemporalStubModule {}

export const getTemporalModule = (
  isWorkers: boolean,
  path?: string,
  activityClasses?: any[]
) => {
  // If Temporal is disabled, return a stub module that provides a no-op TemporalService
  if (process.env.DISABLE_TEMPORAL_INIT === 'true') {
    return TemporalStubModule;
  }

  // Otherwise use real Temporal
  const { TemporalModule } = require('nestjs-temporal-core');
  return TemporalModule.register({
    isGlobal: true,
    connection: {
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      ...process.env.TEMPORAL_TLS === 'true' ? {tls: true} : {},
      ...process.env.TEMPORAL_API_KEY ? {apiKey: process.env.TEMPORAL_API_KEY} : {},
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    },
    taskQueue: 'main',
    logLevel: 'error',
    ...(isWorkers
      ? {
          workers: [
            {
              taskQueue: 'main',
              workflowsPath: path!,
              activityClasses: activityClasses!,
              autoStart: true,
            },
          ],
        }
      : {}),
  });
};
