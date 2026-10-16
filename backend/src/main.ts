import 'reflect-metadata';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createApp } from './bootstrap';
import { loadEnv } from './config/env';
import { JobsService } from './jobs/jobs.service';
import { logger } from './common/logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();
  if (!env.isProd) {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Cooper Waters API').setVersion('1').addBearerAuth().build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  await app.init(); // registers job handlers (onModuleInit) before workers pick up jobs
  if (env.runWorkers) await app.get(JobsService).startWorkers();
  await app.listen(env.port, '0.0.0.0');
  logger.info({ port: env.port, workers: env.runWorkers }, 'Cooper Waters API listening');
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
