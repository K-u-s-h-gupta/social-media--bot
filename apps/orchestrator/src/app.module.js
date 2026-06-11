import { __decorate } from "tslib";
import { Module } from '@nestjs/common';
import { DatabaseModule } from "../../../libraries/nestjs-libraries/src/database/prisma/database.module";
import { HealthController } from "./health.controller";
let AppModule = class AppModule {
};
AppModule = __decorate([
    Module({
        imports: [DatabaseModule],
        controllers: [HealthController],
        providers: [],
        get exports() {
            return [...this.providers, ...this.imports];
        },
    })
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map