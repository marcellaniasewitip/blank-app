import { logger } from '../common/logger';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  readonly name: string;
  /** Resolves when the push service accepted the message; rejects if not delivered. */
  send(msg: PushMessage): Promise<void>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export class MockPushProvider implements PushProvider {
  readonly name = 'mock';
  static readonly sent: PushMessage[] = [];
  static failNext = 0;

  async send(msg: PushMessage): Promise<void> {
    if (MockPushProvider.failNext > 0) {
      MockPushProvider.failNext--;
      throw new Error('mock push failure');
    }
    MockPushProvider.sent.push(msg);
    if (MockPushProvider.sent.length > 1000) MockPushProvider.sent.shift();
    logger.debug({ msg }, 'mock push');
  }
}

/** Firebase Cloud Messaging. Requires FCM_SERVICE_ACCOUNT_B64 (base64 service-account JSON). */
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';
  private messaging: any;

  constructor(serviceAccountB64: string) {
    // Lazy require keeps firebase-admin out of the cold path when unused.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    const credentials = JSON.parse(Buffer.from(serviceAccountB64, 'base64').toString('utf8'));
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(credentials) });
    this.messaging = app.messaging();
  }

  async send(msg: PushMessage): Promise<void> {
    await this.messaging.send({
      token: msg.token,
      notification: { title: msg.title, body: msg.body },
      data: msg.data,
      android: { priority: 'high', ttl: 600_000 },
    });
  }
}

export function createPushProvider(name: string, fcmB64?: string): PushProvider {
  if (name === 'mock') return new MockPushProvider();
  if (name === 'fcm') {
    if (!fcmB64) throw new Error('PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_B64');
    return new FcmPushProvider(fcmB64);
  }
  logger.warn({ name }, 'unknown PUSH_PROVIDER, falling back to mock');
  return new MockPushProvider();
}
