import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminPrincipal, UserPrincipal } from './auth.types';
import { PermissionKey } from './permissions';

export const IS_PUBLIC = 'cw:public';
export const USER_ROLES = 'cw:userRoles';
export const ADMIN_PERMS = 'cw:adminPerms';
export const ADMIN_ONLY = 'cw:adminOnly';

/** No authentication required. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Customer/driver route group guard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(USER_ROLES, roles);
/** Admin route group: require all listed permissions. */
export const RequirePermissions = (...perms: PermissionKey[]) => SetMetadata(ADMIN_PERMS, perms);
/** Admin route that needs a signed-in admin but no specific permission. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): UserPrincipal => {
  return ctx.switchToHttp().getRequest().principal;
});

export const CurrentAdmin = createParamDecorator((_d: unknown, ctx: ExecutionContext): AdminPrincipal => {
  return ctx.switchToHttp().getRequest().principal;
});
