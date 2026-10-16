import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../auth/decorators';
import { PaymentsService } from './payments.service';
import { Errors } from '../common/errors';

/**
 * POST /api/v1/webhooks/cellmoney/:provider (§8.3): verify signature, store the raw payload, dedupe,
 * return 200 fast. The actual payment update runs in a job.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('cellmoney/:provider')
  @HttpCode(200)
  cellmoney(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }) {
    if (!req.rawBody) throw Errors.badRequest('empty_body', 'Empty webhook body');
    return this.payments.ingestWebhook(provider, req.headers as Record<string, unknown>, req.rawBody);
  }
}
