import { Module } from '@nestjs/common';
import { DatabaseModule } from '@gitroom/nestjs-libraries/database/prisma/database.module';
import { HealthController } from '@gitroom/orchestrator/health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [],
  get exports() {
    return [...this.providers, ...this.imports];
  },
})
export class AppModule {}
