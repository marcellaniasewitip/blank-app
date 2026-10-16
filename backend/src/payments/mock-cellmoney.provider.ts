import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { CollectionRequest, PaymentProvider, PaymentStatus, ProviderEvent, RefundResult } from './payment-provider';

/**
 * Simulated provider for dev, tests and the simulator (§8.3). Behaviour is chosen by the MSISDN's last digits:
 *   …0000 → fails immediately          …1111 → succeeds immediately
 *   …2222 → pending, never resolves    …3333 → pending, webhook says failed
 *   anything else → pending, then a success webhook delivered TWICE (to prove idempotency)
 * Webhooks are signed with HMAC-SHA256 (header `x-mock-signature`).
 */
export class MockCellMoneyProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly manual = false;
  /** providerRef → current status (process memory; fine for a mock). */
  private readonly state = new Map<string, { status: PaymentStatus; amountToea: number; msisdn: string }>();
  private readonly refunds = new Map<string, RefundResult>();

  /**
   * Set by PaymentsService: deliver a webhook after a delay. Tests leave it unset and drive webhooks by hand.
   */
  scheduleWebhook?: (rawBody: Buffer, headers: Record<string, string>, delayMs: number) => Promise<void>;
  /** Delay before the simulated webhook (ms). */
  webhookDelayMs = 3000;

  constructor(private readonly secret: string) {}

  async initiateCollection(req: CollectionRequest): Promise<{ providerRef: string; status: PaymentStatus }> {
    const providerRef = `mock-${req.idempotencyKey}`;
    const existing = this.state.get(providerRef);
    if (existing) return { providerRef, status: existing.status };
    const suffix = req.msisdn.slice(-4);
    const status: PaymentStatus = suffix === '0000' ? 'failed' : suffix === '1111' ? 'succeeded' : 'pending';
    this.state.set(providerRef, { status, amountToea: req.amountToea, msisdn: req.msisdn });
    if (status === 'pending' && suffix !== '2222' && this.scheduleWebhook) {
      const final: PaymentStatus = suffix === '3333' ? 'failed' : 'succeeded';
      const body = this.buildWebhook(providerRef, final, req.amountToea);
      await this.scheduleWebhook(body.rawBody, body.headers, this.webhookDelayMs);
      if (final === 'succeeded') {
        // Duplicate delivery with a different event id, as real providers do on retry.
        const dup = this.buildWebhook(providerRef, final, req.amountToea);
        await this.scheduleWebhook(dup.rawBody, dup.headers, this.webhookDelayMs + 500);
      }
    }
    return { providerRef, status };
  }

  async getStatus(providerRef: string): Promise<PaymentStatus> {
    return this.state.get(providerRef)?.status ?? 'pending';
  }

  async refund(req: { providerRef: string; amountToea: number; idempotencyKey: string }): Promise<RefundResult> {
    const prior = this.refunds.get(req.idempotencyKey);
    if (prior) return prior;
    const result: RefundResult = { status: 'succeeded', providerRef: `mock-refund-${randomUUID()}` };
    this.refunds.set(req.idempotencyKey, result);
    return result;
  }

  verifyWebhook(headers: Record<string, string>, rawBody: Buffer): boolean {
    const sig = headers['x-mock-signature'];
    if (!sig) return false;
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: Buffer): ProviderEvent {
    const body = JSON.parse(rawBody.toString('utf8'));
    if (!body?.eventId || !body?.providerRef || !['succeeded', 'failed', 'pending'].includes(body?.status)) {
      throw new Error('Malformed mock webhook');
    }
    // Keep the mock's own view in sync (e.g. tests that inject webhooks directly).
    const st = this.state.get(body.providerRef);
    if (st) st.status = body.status;
    return { eventId: body.eventId, providerRef: body.providerRef, status: body.status, amountToea: body.amountToea, feeToea: body.feeToea, raw: body };
  }

  /** Build a signed webhook as the provider would send it (tests and simulator). */
  buildWebhook(providerRef: string, status: PaymentStatus, amountToea?: number, eventId: string = randomUUID()) {
    const st = this.state.get(providerRef);
    if (st) st.status = status;
    const rawBody = Buffer.from(JSON.stringify({ eventId, providerRef, status, amountToea: amountToea ?? st?.amountToea }));
    const headers = { 'x-mock-signature': createHmac('sha256', this.secret).update(rawBody).digest('hex'), 'content-type': 'application/json' };
    return { rawBody, headers };
  }

  /** Test hook: change what getStatus() returns (simulate a webhook that never arrives). */
  setStatus(providerRef: string, status: PaymentStatus): void {
    const st = this.state.get(providerRef);
    if (st) st.status = status;
  }
}
