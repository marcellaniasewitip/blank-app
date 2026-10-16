import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 30_000;

/** Role → permission set, cached briefly so every admin request doesn't hit three tables. */
@Injectable()
export class AdminPermissionsCache {
  private readonly cache = new Map<string, { at: number; perms: Set<string> }>();
  constructor(private readonly prisma: PrismaService) {}

  async forRole(roleId: string): Promise<Set<string>> {
    const hit = this.cache.get(roleId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.perms;
    const rows = await this.prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
    const perms = new Set(rows.map((r) => r.permission.key));
    this.cache.set(roleId, { at: Date.now(), perms });
    return perms;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
