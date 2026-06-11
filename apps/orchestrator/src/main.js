import { __awaiter } from "tslib";
import { initializeSentry } from "../../../libraries/nestjs-libraries/src/sentry/initialize.sentry";
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { NestFactory } from '@nestjs/core';
import { AppModule } from "./app.module";
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
function bootstrap() {
    return __awaiter(this, void 0, void 0, function* () {
        const app = yield NestFactory.create(AppModule);
        app.enableShutdownHooks();
        const port = process.env.ORCHESTRATOR_PORT || 3002;
        yield app.listen(port);
        console.log(`Orchestrator health check listening on port ${port}`);
    });
}
bootstrap();
//# sourceMappingURL=main.js.map