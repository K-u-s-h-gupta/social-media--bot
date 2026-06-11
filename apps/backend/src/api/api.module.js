import { __decorate } from "tslib";
import { Module } from '@nestjs/common';
import { SwarmController } from "./routes/swarm.controller";
import { CredentialService } from "../../../../libraries/nestjs-libraries/src/swarm/credential.service";
import { CredentialRepository } from "../../../../libraries/nestjs-libraries/src/swarm/credential.repository";
import { DeploymentService } from "../../../../libraries/nestjs-libraries/src/swarm/deployment.service";
import { DeploymentRepository } from "../../../../libraries/nestjs-libraries/src/swarm/deployment.repository";
import { AttachmentService } from "../../../../libraries/nestjs-libraries/src/swarm/attachment.service";
import { AttachmentRepository } from "../../../../libraries/nestjs-libraries/src/swarm/attachment.repository";
import { SwarmNoAuthMiddleware } from "../services/auth/swarm.no-auth.middleware";
let ApiModule = class ApiModule {
    configure(consumer) {
        consumer.apply(SwarmNoAuthMiddleware).forRoutes(SwarmController);
    }
};
ApiModule = __decorate([
    Module({
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
], ApiModule);
export { ApiModule };
//# sourceMappingURL=api.module.js.map