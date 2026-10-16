import { Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { PaymentProvider } from './payment-provider';
import { ManualCellMoneyProvider } from './manual-cellmoney.provider';
import { MockCellMoneyProvider } from './mock-cellmoney.provider';
import { ProviderNameCellMoneyProvider } from './provider-name-cellmoney.provider';
import { Errors } from '../common/errors';

@Injectable()
export class PaymentProvidersRegistry {
  private readonly providers = new Map<string, PaymentProvider>();
  readonly mock: MockCellMoneyProvider;

  constructor() {
    this.mock = new MockCellMoneyProvider(loadEnv().mockCellmoneyWebhookSecret);
    for (const p of [new ManualCellMoneyProvider(), this.mock, new ProviderNameCellMoneyProvider()]) {
      this.providers.set(p.name, p);
    }
  }

  get(name: string): PaymentProvider {
    const p = this.providers.get(name);
    if (!p) throw Errors.notFound(`Payment provider ${name}`);
    if (p.name === 'mock' && loadEnv().isProd && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
      throw Errors.badRequest('mock_provider_disabled', 'The mock payment provider is disabled in production');
    }
    return p;
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}
