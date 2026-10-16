import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface AuditInput {
  actorId: string | null;
  actorType: 'admin' | 'system' | 'driver' | 'customer';
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Every admin action is written here (§12). Pass the transaction so the log commits with the change. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: input.actorId,
        actorType: input.actorType,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : sanitise(input.before),
        after: input.after === undefined ? undefined : sanitise(input.after),
        ip: input.ip ?? null,
      },
    });
  }
}

const SECRET_FIELDS = new Set(['passwordHash', 'totpSecret', 'codeHash', 'tokenHash']);

function sanitise(value: unknown): any {
  return JSON.parse(
    JSON.stringify(value, (k, v) => (SECRET_FIELDS.has(k) ? '[redacted]' : v)),
  );
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
