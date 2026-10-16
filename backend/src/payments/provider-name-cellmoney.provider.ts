import { CollectionRequest, PaymentProvider, PaymentStatus, ProviderEvent, RefundResult } from './payment-provider';

/**
 * Stub for the real cell money API. [CONFIRM] provider, API docs, sandbox credentials and webhook signing
 * method (§16 #1), then:
 *  1. Rename this class/file to the provider (e.g. `<Telco>CellMoneyProvider`) and set `name`.
 *  2. Implement the calls with the provider's HTTP API (read credentials from env vars only).
 *  3. Register it in PaymentProvidersRegistry and set setting `payment.cellmoney.adapter` to its name.
 *  4. Point the provider's webhook at POST /api/v1/webhooks/cellmoney/<name>.
 */
export class ProviderNameCellMoneyProvider implements PaymentProvider {
  readonly name = 'provider_name';
  readonly manual = false;

  async initiateCollection(_req: CollectionRequest): Promise<{ providerRef: string; status: PaymentStatus }> {
    throw new Error('ProviderNameCellMoneyProvider is not implemented yet ([CONFIRM] provider)');
  }

  async getStatus(_providerRef: string): Promise<PaymentStatus> {
    throw new Error('ProviderNameCellMoneyProvider is not implemented yet');
  }

  async refund(_req: { providerRef: string; amountToea: number; idempotencyKey: string }): Promise<RefundResult> {
    return { status: 'unsupported' };
  }

  verifyWebhook(_headers: Record<string, string>, _rawBody: Buffer): boolean {
    return false;
  }

  parseWebhook(_rawBody: Buffer): ProviderEvent {
    throw new Error('ProviderNameCellMoneyProvider is not implemented yet');
  }
}
