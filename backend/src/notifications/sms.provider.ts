import { logger } from '../common/logger';

export interface SmsSendResult {
  providerMessageId: string;
}

/** SMS gateway adapter (§9). The real PNG gateway is [CONFIRM]; add an adapter and select it with SMS_PROVIDER. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Dev/test SMS: logs and keeps an in-memory outbox so tests and the simulator can read OTPs. */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  static readonly outbox: { to: string; body: string; at: Date }[] = [];
  /** Test hook: make the next N sends fail. */
  static failNext = 0;

  async send(to: string, body: string): Promise<SmsSendResult> {
    if (MockSmsProvider.failNext > 0) {
      MockSmsProvider.failNext--;
      throw new Error('mock sms failure');
    }
    MockSmsProvider.outbox.push({ to, body, at: new Date() });
    if (MockSmsProvider.outbox.length > 1000) MockSmsProvider.outbox.shift();
    logger.info({ to, body }, 'mock sms');
    return { providerMessageId: `mock-${Date.now()}` };
  }

  static lastTo(to: string): string | undefined {
    for (let i = MockSmsProvider.outbox.length - 1; i >= 0; i--) {
      if (MockSmsProvider.outbox[i].to === to) return MockSmsProvider.outbox[i].body;
    }
    return undefined;
  }
}

/**
 * Placeholder for the real SMS gateway. [CONFIRM] provider, API docs and credentials, then implement `send`
 * with an HTTP call and select it with SMS_PROVIDER=gateway.
 */
export class GatewaySmsProvider implements SmsProvider {
  readonly name = 'gateway';
  async send(_to: string, _body: string): Promise<SmsSendResult> {
    throw new Error('GatewaySmsProvider is not configured: the SMS gateway is still [CONFIRM]');
  }
}

export function createSmsProvider(name: string): SmsProvider {
  switch (name) {
    case 'mock':
      return new MockSmsProvider();
    case 'gateway':
      return new GatewaySmsProvider();
    default:
      throw new Error(`Unknown SMS_PROVIDER ${name}`);
  }
}

/** GSM 03.38 basic character set + extension table. SMS templates must stay within it (§9). */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€\f';

export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_BASIC.includes(ch) && !GSM7_EXT.includes(ch)) return false;
  }
  return true;
}

/** Length in GSM-7 septets (extension chars count double). */
export function gsm7Length(text: string): number {
  let n = 0;
  for (const ch of text) n += GSM7_EXT.includes(ch) ? 2 : 1;
  return n;
}
