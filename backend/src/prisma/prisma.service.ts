import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Run `fn` in a transaction (READ COMMITTED + explicit row locks where needed). */
  tx<T>(fn: (tx: Tx) => Promise<T>, timeoutMs = 15000): Promise<T> {
    return this.$transaction(fn, { timeout: timeoutMs, maxWait: 10000 });
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
