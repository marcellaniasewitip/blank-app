import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  applyDecorators,
  UseInterceptors,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import { createHash } from 'crypto';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError, Errors } from './errors';

const IDEMPOTENT = 'cw:idempotent';

/**
 * Marks a route as requiring an `Idempotency-Key` header (§11). The first response is stored and replayed
 * for retries with the same key, so a flaky network can never double-submit an order or payment.
 * The key is scoped to the authenticated subject and route. Reusing a key with a different body → 422.
 */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENT, true),
    ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique key per logical request (UUID recommended)' }),
    UseInterceptors(IdempotencyInterceptor),
  );

/** The validated Idempotency-Key header (only on @Idempotent routes). */
export const IdempotencyKey = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().idempotencyKey;
});

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, ctx.getHandler())) return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key: string | undefined = req.headers['idempotency-key'];
    if (!key || key.length < 8 || key.length > 100 || !/^[\w\-:.]+$/.test(key)) {
      return throwError(() => Errors.badRequest('idempotency_key_required', 'Idempotency-Key header (8-100 chars) is required'));
    }
    req.idempotencyKey = key;
    const subject = req.principal?.id ?? 'anon';
    const scope = `${subject}:${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ p: req.params, b: req.body ?? null })).digest('hex');

    return from(this.claim(scope, key, requestHash)).pipe(
      mergeMap((existing) => {
        if (existing) {
          res.status(existing.code);
          res.setHeader('Idempotent-Replay', 'true');
          return of(existing.body);
        }
        return next.handle().pipe(
          mergeMap((body) =>
            from(
              this.prisma.idempotencyRecord.update({
                where: { scope_key: { scope, key } },
                data: { status: 'completed', responseCode: res.statusCode ?? 200, responseBody: (body ?? null) as any },
              }),
            ).pipe(mergeMap(() => of(body))),
          ),
          catchError((err) =>
            // Client errors are final for this key (replayed); server errors release the key so retry can proceed.
            from(this.finishWithError(scope, key, err)).pipe(mergeMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  private async claim(scope: string, key: string, requestHash: string): Promise<{ code: number; body: unknown } | null> {
    try {
      await this.prisma.idempotencyRecord.create({ data: { scope, key, requestHash, status: 'in_progress' } });
      return null;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    const rec = await this.prisma.idempotencyRecord.findUniqueOrThrow({ where: { scope_key: { scope, key } } });
    if (rec.requestHash !== requestHash) {
      throw Errors.invalid('idempotency_key_reused', 'This Idempotency-Key was used for a different request');
    }
    if (rec.status !== 'completed') {
      throw Errors.conflict('request_in_progress', 'The same request is still being processed. Retry shortly.');
    }
    if (rec.responseCode && rec.responseCode >= 400) {
      const body = rec.responseBody as any;
      throw new AppError(body?.error?.code ?? 'error', body?.error?.message ?? 'Request failed', rec.responseCode, body?.error?.details);
    }
    return { code: rec.responseCode ?? 200, body: rec.responseBody };
  }

  private async finishWithError(scope: string, key: string, err: any): Promise<void> {
    const status: number = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
    if (status >= 500 || status === 409 || status === 429) {
      await this.prisma.idempotencyRecord.delete({ where: { scope_key: { scope, key } } }).catch(() => undefined);
      return;
    }
    const body = typeof err?.getResponse === 'function' ? err.getResponse() : null;
    await this.prisma.idempotencyRecord
      .update({ where: { scope_key: { scope, key } }, data: { status: 'completed', responseCode: status, responseBody: body as any } })
      .catch(() => undefined);
  }
}
