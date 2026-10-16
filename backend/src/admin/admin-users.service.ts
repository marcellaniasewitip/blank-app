import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminPermissionsCache } from '../auth/admin-permissions.cache';
import { AdminAuthService } from '../auth/admin-auth.service';
import { TokensService } from '../auth/tokens.service';
import { ALL_PERMISSIONS, PERMISSIONS } from '../auth/permissions';
import { Errors } from '../common/errors';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perms: AdminPermissionsCache,
    private readonly tokens: TokensService,
  ) {}

  permissions() {
    return ALL_PERMISSIONS.map((key) => ({ key, description: PERMISSIONS[key] }));
  }

  async roles() {
    const roles = await this.prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { admins: true } } }, orderBy: { name: 'asc' } });
    return roles.map((r) => ({ id: r.id, name: r.name, description: r.description, isSystem: r.isSystem, adminCount: r._count.admins, permissions: r.permissions.map((p) => p.permission.key) }));
  }

  async upsertRole(adminId: string, id: string | null, input: { name: string; description?: string; permissions: string[] }, ip: string | null) {
    const unknown = input.permissions.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
    if (unknown.length) throw Errors.invalid('unknown_permission', `Unknown permissions: ${unknown.join(', ')}`);
    const before = id ? await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } }) : null;
    if (id && !before) throw Errors.notFound('Role');
    if (before?.isSystem && before.name === 'Super Admin' && !input.permissions.includes('admins.manage')) {
      throw Errors.invalid('locked_role', 'Super Admin must keep admins.manage');
    }
    const permRows = await this.prisma.permission.findMany({ where: { key: { in: input.permissions } } });
    const role = await this.prisma.tx(async (tx) => {
      const r = id
        ? await tx.role.update({ where: { id }, data: { name: input.name, description: input.description } })
        : await tx.role.create({ data: { name: input.name, description: input.description } });
      await tx.rolePermission.deleteMany({ where: { roleId: r.id } });
      await tx.rolePermission.createMany({ data: permRows.map((p) => ({ roleId: r.id, permissionId: p.id })) });
      await this.audit.log(
        { actorId: adminId, actorType: 'admin', action: id ? 'role.update' : 'role.create', entity: 'role', entityId: r.id, before: before ? { ...before, permissions: before.permissions.map((p) => p.permission.key) } : undefined, after: { ...r, permissions: input.permissions }, ip },
        tx,
      );
      return r;
    });
    this.perms.invalidate();
    return role;
  }

  async deleteRole(adminId: string, id: string, ip: string | null) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { admins: true } } } });
    if (!role) throw Errors.notFound('Role');
    if (role.isSystem) throw Errors.invalid('locked_role', 'Built-in roles cannot be deleted');
    if (role._count.admins > 0) throw Errors.conflict('role_in_use', 'Move admins to another role first');
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({ actorId: adminId, actorType: 'admin', action: 'role.delete', entity: 'role', entityId: id, before: role, ip });
    this.perms.invalidate();
  }

  async admins() {
    const rows = await this.prisma.adminUser.findMany({ include: { role: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((a) => ({ id: a.id, email: a.email, name: a.name, status: a.status, totpEnabled: a.totpEnabled, lastLoginAt: a.lastLoginAt, role: { id: a.role.id, name: a.role.name }, createdAt: a.createdAt }));
  }

  async createAdmin(adminId: string, input: { email: string; name: string; password: string; roleId: string }, ip: string | null) {
    assertStrongPassword(input.password);
    const role = await this.prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw Errors.notFound('Role');
    const a = await this.prisma.adminUser.create({
      data: { email: input.email.toLowerCase().trim(), name: input.name, passwordHash: await AdminAuthService.hashPassword(input.password), roleId: role.id },
    });
    await this.audit.log({ actorId: adminId, actorType: 'admin', action: 'admin.create', entity: 'admin_user', entityId: a.id, after: { id: a.id, email: a.email, name: a.name, roleId: a.roleId }, ip });
    return { id: a.id, email: a.email, name: a.name, roleId: a.roleId, status: a.status };
  }

  async updateAdmin(adminId: string, id: string, input: { name?: string; roleId?: string; status?: 'active' | 'disabled'; password?: string; resetTotp?: boolean }, ip: string | null) {
    const before = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('Admin');
    if (id === adminId && (input.status === 'disabled' || input.roleId)) throw Errors.invalid('self_change', 'You cannot disable yourself or change your own role');
    if (input.password) assertStrongPassword(input.password);
    const after = await this.prisma.adminUser.update({
      where: { id },
      data: {
        name: input.name,
        roleId: input.roleId,
        status: input.status,
        passwordHash: input.password ? await AdminAuthService.hashPassword(input.password) : undefined,
        ...(input.resetTotp ? { totpEnabled: false, totpSecret: null } : {}),
      },
    });
    if (input.status === 'disabled' || input.password) await this.tokens.revokeAll(id);
    await this.audit.log({ actorId: adminId, actorType: 'admin', action: 'admin.update', entity: 'admin_user', entityId: id, before, after, ip });
    return { id: after.id, email: after.email, name: after.name, roleId: after.roleId, status: after.status, totpEnabled: after.totpEnabled };
  }
}

function assertStrongPassword(pw: string): void {
  if (pw.length < 12 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    throw Errors.invalid('weak_password', 'Passwords need at least 12 characters with letters and numbers');
  }
}
