const { register: registerPaths } = require('tsconfig-paths');
const { resolve: resolvePath } = require('path');
const _projectRoot = resolvePath(__dirname, '../../../../..');
const _distRoot = resolvePath(_projectRoot, 'dist/backend');
registerPaths({
  baseUrl: _distRoot,
  paths: {
    '@gitroom/backend/*': ['apps/backend/src/*'],
    '@gitroom/frontend/*': ['apps/frontend/src/*'],
    '@gitroom/helpers/*': ['libraries/helpers/src/*'],
    '@gitroom/nestjs-libraries/*': ['libraries/nestjs-libraries/src/*'],
    '@gitroom/react/*': ['libraries/react-shared-libraries/src/*'],
    '@gitroom/plugins/*': ['libraries/plugins/src/*'],
    '@gitroom/orchestrator/*': ['apps/orchestrator/src/*'],
  },
});

if (process.env.SENTRY_DSN) {
  try {
    const { initializeSentry } = require('@gitroom/nestjs-libraries/sentry/initialize.sentry');
    initializeSentry('backend', true);
  } catch (_e) { /* skip */ }
}

import compression from 'compression';
import { loadSwagger } from '@gitroom/helpers/swagger/load.swagger';

if (process.env.DISABLE_TEMPORAL_WORKER !== 'true') {
  try {
    const { Runtime } = require('@temporalio/worker');
    Runtime.install({ shutdownSignals: [] });
  } catch (_e) { /* skip */ }
}

process.env.TZ = 'UTC';

import cookieParser from 'cookie-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from '@gitroom/nestjs-libraries/services/exception.filter';
import { ConfigurationChecker } from '@gitroom/helpers/configuration/configuration.checker';

async function start() {
  console.log('[backend] bootstrap:start');
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    cors: {
      ...(!process.env.NOT_SECURED ? { credentials: true } : {}),
      allowedHeaders: ['Content-Type', 'Authorization', 'auth', 'showorg'],
      exposedHeaders: ['reload', 'onboarding', 'activate'],
      origin: [
        process.env.FRONTEND_URL,
        ...(process.env.MAIN_URL ? [process.env.MAIN_URL] : []),
      ],
    },
  });
  console.log('[backend] bootstrap:app-created');

  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.use(cookieParser());
  app.use(compression());
  app.useGlobalFilters(new HttpExceptionFilter());

  loadSwagger(app);

  const port = process.env.PORT || 3000;

  try {
    console.log('[backend] bootstrap:listening', port);
    await app.listen(port);
    console.log('Backend started successfully on port ' + port);

    checkConfiguration();

    Logger.log(`Backend is running on: http://localhost:${port}`);
  } catch (e) {
    Logger.error(`Backend failed to start on port ${port}`, e);
  }
}

function checkConfiguration() {
  const checker = new ConfigurationChecker();
  checker.readEnvFromProcess();
  checker.check();

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }
    Logger.warn('Configuration issues found: ' + checker.getIssuesCount());
  } else {
    Logger.log('Configuration check completed without any issues');
  }
}

start();
