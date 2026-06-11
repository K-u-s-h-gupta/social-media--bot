import { __decorate } from "tslib";
import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from "../../../libraries/nestjs-libraries/src/database/prisma/database.module";
import { ApiModule } from "./api/api.module";
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from "../../../libraries/nestjs-libraries/src/throttler/throttler.provider";
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from "../../../libraries/nestjs-libraries/src/redis/redis.service";
const optionalImports = [];
if (process.env.SENTRY_DSN) {
    try {
        const { SentryModule } = require('@sentry/nestjs/setup');
        optionalImports.unshift(SentryModule.forRoot());
    }
    catch (_e) { /* skip */ }
}
let AppModule = class AppModule {
};
AppModule = __decorate([
    Global(),
    Module({
        imports: [
            DatabaseModule,
            ApiModule,
            ThrottlerModule.forRoot({
                throttlers: [
                    {
                        ttl: 3600000,
                        limit: process.env.API_LIMIT ? Number(process.env.API_LIMIT) : 90,
                    },
                ],
                storage: new ThrottlerStorageRedisService(ioRedis),
            }),
            ...optionalImports,
        ],
        controllers: [],
        providers: [
            {
                provide: APP_GUARD,
                useClass: ThrottlerBehindProxyGuard,
            },
        ],
        exports: [DatabaseModule, ApiModule, ThrottlerModule],
    })
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map