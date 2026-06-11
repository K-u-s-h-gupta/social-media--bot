import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SwarmController } from '@gitroom/backend/api/routes/swarm.controller';
import { CredentialService } from '@gitroom/nestjs-libraries/swarm/credential.service';
import { CredentialRepository } from '@gitroom/nestjs-libraries/swarm/credential.repository';
import { DeploymentService } from '@gitroom/nestjs-libraries/swarm/deployment.service';
import { DeploymentRepository } from '@gitroom/nestjs-libraries/swarm/deployment.repository';
import { AttachmentService } from '@gitroom/nestjs-libraries/swarm/attachment.service';
import { AttachmentRepository } from '@gitroom/nestjs-libraries/swarm/attachment.repository';
import { SwarmNoAuthMiddleware } from '@gitroom/backend/services/auth/swarm.no-auth.middleware';

@Module({
  imports: [],
  controllers: [SwarmController],
  providers: [
    CredentialService,
    CredentialRepository,
    DeploymentService,
    DeploymentRepository,
    AttachmentService,
    AttachmentRepository,
    SwarmNoAuthMiddleware,
  ],
  get exports() {
    return [...this.providers];
  },
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SwarmNoAuthMiddleware).forRoutes(SwarmController);
  }
}
