import { CollectionRequest, PaymentProvider, PaymentStatus, ProviderEvent, RefundResult } from './payment-provider';

/**
 * The customer pays the Cooper Waters merchant number using the order short code as reference;
 * an admin matches it in the dashboard (payments.confirm). Used when the provider has no API.
 */
export class ManualCellMoneyProvider implements PaymentProvider {
  readonly name = 'manual';
  readonly manual = true;

  async initiateCollection(req: CollectionRequest): Promise<{ providerRef: string; status: PaymentStatus }> {
    return { providerRef: `manual-${req.idempotencyKey}`, status: 'pending' };
  }

  async getStatus(_providerRef: string): Promise<PaymentStatus> {
    return 'pending'; // only an admin can confirm
  }

  async refund(): Promise<RefundResult> {
    return { status: 'unsupported', message: 'Manual refund: pay the customer back from the merchant account' };
  }

  verifyWebhook(): boolean {
    return false;
  }

  parseWebhook(): ProviderEvent {
    throw new Error('The manual provider has no webhooks');
  }
}
