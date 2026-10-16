import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import IORedis from 'ioredis';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { loadEnv } from '../config/env';

let redis: IORedis | undefined;

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + dependencies (DB, Redis). 503 when a dependency is down. */
  @Get()
  async health(@Res() res: Response) {
    const checks: Record<string, 'ok' | 'down'> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    if (process.env.JOBS_DRIVER !== 'memory') {
      try {
        redis ??= new IORedis(loadEnv().redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2000 });
        if (redis.status !== 'ready') await redis.connect().catch(() => undefined);
        checks.redis = (await redis.ping()) === 'PONG' ? 'ok' : 'down';
      } catch {
        checks.redis = 'down';
      }
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({ status: ok ? 'ok' : 'degraded', checks, version: process.env.APP_VERSION ?? 'dev', time: new Date().toISOString() });
  }
}
