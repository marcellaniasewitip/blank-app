import { logger } from './logger';

/**
 * Side effects (notifications, websocket pushes, job scheduling, provider calls) collected during a
 * DB transaction and run only after it commits. If the process dies in between, the sweeper and
 * provider polling recover the state, so effects are best-effort.
 */
export class AfterCommit {
  private readonly fns: Array<() => Promise<unknown> | unknown> = [];

  add(fn: () => Promise<unknown> | unknown): void {
    this.fns.push(fn);
  }

  async run(): Promise<void> {
    for (const fn of this.fns.splice(0)) {
      try {
        await fn();
      } catch (err) {
        logger.error({ err }, 'after-commit effect failed');
      }
    }
  }
}
