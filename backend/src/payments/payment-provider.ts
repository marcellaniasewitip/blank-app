/**
 * Cell money (mobile money) provider adapter (§8.3). One adapter per provider; select the adapter for
 * new payments with setting `payment.cellmoney.adapter`. Existing payments keep the adapter they started with.
 */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface RefundResult {
  /** `unsupported` → no API refund; a manual refund task is created for Finance. */
  status: 'succeeded' | 'pending' | 'failed' | 'unsupported';
  providerRef?: string;
  message?: string;
}

export interface ProviderEvent {
  /** Unique per delivery attempt from the provider's side; duplicates are ignored. */
  eventId: string;
  providerRef: string;
  status: PaymentStatus;
  amountToea?: number;
  feeToea?: number;
  raw: unknown;
}

export interface CollectionRequest {
  amountToea: number;
  msisdn: string;
  reference: string;
  idempotencyKey: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** Manual adapters need a human to confirm payments; they have no API or webhooks. */
  readonly manual: boolean;
  initiateCollection(req: CollectionRequest): Promise<{ providerRef: string; status: PaymentStatus }>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
  refund(req: { providerRef: string; amountToea: number; idempotencyKey: string }): Promise<RefundResult>;
  verifyWebhook(headers: Record<string, string>, rawBody: Buffer): boolean;
  parseWebhook(rawBody: Buffer): ProviderEvent;
}
