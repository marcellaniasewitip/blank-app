import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { JobsService } from './jobs/jobs.service';
import { loadEnv } from './config/env';
import { logger } from './common/logger';

/** Background worker process (BullMQ): order expiry, payment timeouts/polling, webhooks, notifications, sweeper. */
async function main(): Promise<void> {
  const env = loadEnv();
  if (env.sentryDsn) Sentry.init({ dsn: env.sentryDsn, environment: env.nodeEnv, release: process.env.APP_VERSION });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  await app.get(JobsService).startWorkers();
  logger.info('Cooper Waters worker started');
}

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
