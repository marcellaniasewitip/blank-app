import { UserRole } from '@prisma/client';

export interface UserPrincipal {
  kind: 'user';
  id: string;
  role: UserRole;
  phone: string;
}

export interface AdminPrincipal {
  kind: 'admin';
  id: string;
  roleId: string;
  email: string;
  permissions: Set<string>;
}

export type Principal = UserPrincipal | AdminPrincipal;

export interface AccessTokenPayload {
  sub: string;
  typ: 'user' | 'admin';
  role?: UserRole;
  /** Admin: set when the session completed TOTP (or TOTP isn't enabled). */
  mfa?: boolean;
}
