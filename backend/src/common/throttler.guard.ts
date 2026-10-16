import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit authenticated requests per account instead of per IP: PNG mobile networks put many users
 * behind carrier-grade NAT, so a per-IP budget would throttle unrelated customers together.
 * The token isn't verified here (AuthGuard does that); a forged subject only buys an unauthenticated
 * request that fails immediately.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth: string | undefined = req.headers?.authorization;
    if (auth?.startsWith('Bearer ')) {
      const payload = auth.slice(7).split('.')[1];
      try {
        const sub = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.sub;
        if (typeof sub === 'string' && sub.length <= 64) return `sub:${sub}`;
      } catch {
        /* fall back to IP */
      }
    }
    return `ip:${req.ips?.length ? req.ips[0] : req.ip}`;
  }
}
