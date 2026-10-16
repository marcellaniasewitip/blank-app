import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService, TokenPair } from './tokens.service';
import { AuditService } from '../audit/audit.service';
import { loadEnv } from '../config/env';
import { Errors } from '../common/errors';

authenticator.options = { window: 1 };

const MFA_TOKEN_TTL_SEC = 300;
// Constant-time-ish dummy hash so unknown emails take as long as wrong passwords.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7tC8f9s6gUQbF2U3cP0o6Jp9OQG0E4K';

export type AdminLoginResult = ({ mfaRequired: false } & TokenPair) | { mfaRequired: true; mfaToken: string };

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async login(email: string, password: string, ip: string | null): Promise<AdminLoginResult> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
    const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !ok || admin.status !== 'active') {
      await this.audit.log({ actorId: admin?.id ?? null, actorType: 'admin', action: 'auth.login_failed', entity: 'admin_user', entityId: admin?.id, after: { email }, ip });
      throw Errors.unauthorized('Email or password is incorrect');
    }
    if (admin.totpEnabled && admin.totpSecret) {
      const mfaToken = await this.jwt.signAsync(
        { sub: admin.id, typ: 'admin', purpose: 'mfa' },
        { secret: loadEnv().jwtAccessSecret, expiresIn: MFA_TOKEN_TTL_SEC },
      );
      return { mfaRequired: true, mfaToken };
    }
    return { mfaRequired: false, ...(await this.complete(admin.id, ip)) };
  }

  async verifyTotp(mfaToken: string, code: string, ip: string | null): Promise<TokenPair> {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(mfaToken, { secret: loadEnv().jwtAccessSecret });
    } catch {
      throw Errors.unauthorized('Sign-in expired. Start again.');
    }
    if (payload.purpose !== 'mfa') throw Errors.unauthorized();
    const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin?.totpSecret || admin.status !== 'active') throw Errors.unauthorized();
    if (!authenticator.check(code, admin.totpSecret)) {
      await this.audit.log({ actorId: admin.id, actorType: 'admin', action: 'auth.totp_failed', entity: 'admin_user', entityId: admin.id, ip });
      throw Errors.invalid('totp_invalid', 'That code is not correct');
    }
    return this.complete(admin.id, ip);
  }

  async setupTotp(adminId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (admin.totpEnabled) throw Errors.conflict('totp_already_enabled', 'Two-factor sign-in is already on');
    const secret = authenticator.generateSecret();
    await this.prisma.adminUser.update({ where: { id: adminId }, data: { totpSecret: secret } });
    return { secret, otpauthUrl: authenticator.keyuri(admin.email, 'Cooper Waters Admin', secret) };
  }

  async enableTotp(adminId: string, code: string, ip: string | null): Promise<void> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!admin.totpSecret) throw Errors.badRequest('totp_not_setup', 'Start two-factor setup first');
    if (!authenticator.check(code, admin.totpSecret)) throw Errors.invalid('totp_invalid', 'That code is not correct');
    await this.prisma.adminUser.update({ where: { id: adminId }, data: { totpEnabled: true } });
    await this.audit.log({ actorId: adminId, actorType: 'admin', action: 'auth.totp_enabled', entity: 'admin_user', entityId: adminId, ip });
  }

  async me(adminId: string) {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      totpEnabled: admin.totpEnabled,
      role: { id: admin.role.id, name: admin.role.name },
      permissions: admin.role.permissions.map((p) => p.permission.key),
    };
  }

  private async complete(adminId: string, ip: string | null): Promise<TokenPair> {
    await this.prisma.adminUser.update({ where: { id: adminId }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: adminId, actorType: 'admin', action: 'auth.login', entity: 'admin_user', entityId: adminId, ip });
    return this.tokens.issue({ sub: adminId, typ: 'admin', mfa: true });
  }
}
