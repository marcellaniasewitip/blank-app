import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from './auth.types';
import { Errors } from '../common/errors';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** JWT access tokens + opaque rotating refresh tokens (stored hashed). */
@Injectable()
export class TokensService {
  private readonly env = loadEnv();
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(payload: AccessTokenPayload): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.jwtAccessSecret,
      expiresIn: this.env.jwtAccessTtlSec,
    });
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        subjectId: payload.sub,
        subjectType: payload.typ,
        userId: payload.typ === 'user' ? payload.sub : null,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.env.jwtRefreshTtlSec * 1000),
      },
    });
    return { accessToken, refreshToken: `${payload.typ}.${refreshToken}`, expiresIn: this.env.jwtAccessTtlSec };
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.env.jwtAccessSecret });
    } catch {
      throw Errors.unauthorized('Invalid or expired token');
    }
  }

  /** Rotate: the presented refresh token is revoked and a new pair issued. Reuse of a revoked token revokes all. */
  async refresh(presented: string, build: (subjectId: string, typ: 'user' | 'admin') => Promise<AccessTokenPayload>): Promise<TokenPair> {
    const [typ, raw] = presented.split('.', 2);
    if ((typ !== 'user' && typ !== 'admin') || !raw) throw Errors.unauthorized('Invalid refresh token');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row || row.subjectType !== typ) throw Errors.unauthorized('Invalid refresh token');
    if (row.revokedAt) {
      // Token reuse → likely theft. Kill every session for this subject.
      await this.prisma.refreshToken.updateMany({ where: { subjectId: row.subjectId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw Errors.unauthorized('Refresh token already used');
    }
    if (row.expiresAt < new Date()) throw Errors.unauthorized('Refresh token expired');
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count !== 1) throw Errors.unauthorized('Refresh token already used');
    const payload = await build(row.subjectId, typ);
    return this.issue(payload);
  }

  async revoke(presented: string): Promise<void> {
    const raw = presented.split('.', 2)[1];
    if (!raw) return;
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAll(subjectId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { subjectId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
