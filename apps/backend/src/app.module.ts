import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { ApiModule } from '@gitroom/backend/api/api.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerBehindProxyGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const optionalImports: any[] = [];

if (process.env.SENTRY_DSN) {
  try {
    const { SentryModule } = require('@sentry/nestjs/setup');
    optionalImports.unshift(SentryModule.forRoot());
  } catch (_e) { /* skip */ }
}

@Global()
@Module({
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
export class AppModule {}
