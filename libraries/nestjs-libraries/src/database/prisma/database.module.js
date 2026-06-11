import { __decorate } from "tslib";
import { Global, Module } from '@nestjs/common';
import { PrismaRepository, PrismaService, PrismaTransaction } from './prisma.service';
import { SwarmRepository } from "./swarm/swarm.repository";
let DatabaseModule = class DatabaseModule {
};
DatabaseModule = __decorate([
    Global(),
    Module({
        imports: [],
        controllers: [],
        providers: [PrismaService, PrismaRepository, PrismaTransaction, SwarmRepository],
        get exports() {
            return this.providers;
        },
    })
], DatabaseModule);
export { DatabaseModule };
//# sourceMappingURL=database.module.js.map