import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';
import { ADMIN_ONLY, ADMIN_PERMS, IS_PUBLIC, USER_ROLES } from './decorators';
import { AdminPrincipal, UserPrincipal } from './auth.types';
import { Errors } from '../common/errors';
import { AdminPermissionsCache } from './admin-permissions.cache';

/**
 * Global guard. Every route is authenticated unless @Public(). Route groups (§11):
 * - @Roles('customer' | 'driver') → user JWT with that role, active account.
 * - @RequirePermissions(...) / @AdminOnly() → admin JWT (MFA-complete), active admin, with the permissions.
 * A route without any of these markers is rejected (fail closed).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    private readonly perms: AdminPermissionsCache,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw Errors.unauthorized();
    const payload = await this.tokens.verifyAccess(header.slice(7));

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(USER_ROLES, targets);
    const needPerms = this.reflector.getAllAndOverride<string[] | undefined>(ADMIN_PERMS, targets);
    const adminOnly = this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_ONLY, targets);

    if (roles) {
      if (payload.typ !== 'user' || !payload.role || !roles.includes(payload.role)) throw Errors.forbidden();
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.deletedAt) throw Errors.unauthorized();
      if (user.status !== 'active') throw Errors.forbidden('Your account is suspended. Contact Cooper Waters support.');
      const principal: UserPrincipal = { kind: 'user', id: user.id, role: user.role, phone: user.phone };
      req.principal = principal;
      return true;
    }

    if (needPerms || adminOnly) {
      if (payload.typ !== 'admin' || !payload.mfa) throw Errors.forbidden();
      const admin = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      if (!admin || admin.status !== 'active') throw Errors.unauthorized();
      const permissions = await this.perms.forRole(admin.roleId);
      for (const p of needPerms ?? []) if (!permissions.has(p)) throw Errors.forbidden(`Missing permission ${p}`);
      const principal: AdminPrincipal = { kind: 'admin', id: admin.id, roleId: admin.roleId, email: admin.email, permissions };
      req.principal = principal;
      return true;
    }

    throw Errors.forbidden();
  }
}
