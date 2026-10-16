import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from '../config/env';
import { logger } from '../common/logger';

export type QueueName = 'orders' | 'payments' | 'notifications' | 'maintenance';
export const QUEUES: QueueName[] = ['orders', 'payments', 'notifications', 'maintenance'];

export type JobHandler = (data: any, job?: Job) => Promise<void>;

export interface ScheduledJob {
  queue: QueueName;
  name: string;
  data: any;
  runAt: number;
  jobId?: string;
  attempts?: number;
  attemptsMade?: number;
}

/**
 * Thin wrapper over BullMQ. Handlers register by job name; every handler must be idempotent because
 * jobs can run twice (retries, sweeper catching "missed" jobs). JOBS_DRIVER=memory keeps jobs in an
 * in-process list instead (used by tests so they can fire timers deterministically).
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private connection?: IORedis;
  readonly driver: 'bullmq' | 'memory' = process.env.JOBS_DRIVER === 'memory' ? 'memory' : 'bullmq';
  /** Memory driver only. */
  readonly scheduled: ScheduledJob[] = [];

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async enqueue(
    queue: QueueName,
    name: string,
    data: any,
    opts: { delayMs?: number; jobId?: string; attempts?: number } = {},
  ): Promise<void> {
    const jobId = opts.jobId?.replace(/:/g, '_');
    if (this.driver === 'memory') {
      if (jobId && this.scheduled.some((j) => j.jobId === jobId)) return;
      this.scheduled.push({ queue, name, data, runAt: Date.now() + (opts.delayMs ?? 0), jobId, attempts: opts.attempts });
      return;
    }
    const jobOpts: JobsOptions = {
      delay: opts.delayMs && opts.delayMs > 0 ? opts.delayMs : undefined,
      jobId,
      attempts: opts.attempts ?? 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 24 * 3600, count: 5000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    };
    await this.queue(queue).add(name, data, jobOpts);
  }

  /** Run a handler directly (used by the sweeper and tests). */
  async run(name: string, data: any): Promise<void> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`No job handler registered for ${name}`);
    await h(data);
  }

  /** Memory driver: run (and remove) every scheduled job matching `name` whose time has come, or all if `force`. */
  async drain(name?: string, force = false): Promise<number> {
    let ran = 0;
    for (;;) {
      const idx = this.scheduled.findIndex((j) => (!name || j.name === name) && (force || j.runAt <= Date.now()));
      if (idx < 0) return ran;
      const [job] = this.scheduled.splice(idx, 1);
      try {
        await this.run(job.name, job.data);
      } catch (err) {
        // Mirror BullMQ retries: re-queue until attempts are used up, then surface the error.
        const made = (job.attemptsMade ?? 0) + 1;
        if (made < (job.attempts ?? 5)) this.scheduled.push({ ...job, attemptsMade: made });
        throw err;
      }
      ran++;
    }
  }

  async startWorkers(): Promise<void> {
    if (this.driver === 'memory') return;
    for (const q of QUEUES) {
      const worker = new Worker(
        q,
        async (job) => {
          const h = this.handlers.get(job.name);
          if (!h) throw new Error(`No job handler registered for ${job.name}`);
          await h(job.data, job);
        },
        { connection: this.redis(), prefix: this.prefix(), concurrency: q === 'notifications' ? 10 : 5 },
      );
      worker.on('failed', (job, err) =>
        logger.warn({ queue: q, job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job failed'),
      );
      this.workers.push(worker);
    }
    // Periodic sweeper catches anything a lost delayed job would have missed (§6).
    await this.queue('maintenance').upsertJobScheduler('sweeper', { every: 60_000 }, { name: 'maintenance.sweep' });
    logger.info({ queues: QUEUES }, 'workers started');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    if (this.connection) this.connection.disconnect();
  }

  private queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis(), prefix: this.prefix() });
      this.queues.set(name, q);
    }
    return q;
  }

  private prefix(): string {
    return `${loadEnv().redisPrefix}:bull`;
  }

  private redis(): IORedis {
    if (!this.connection) {
      this.connection = new IORedis(loadEnv().redisUrl, { maxRetriesPerRequest: null });
    }
    return this.connection;
  }
}
