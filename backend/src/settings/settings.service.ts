import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { SETTING_DEFAULTS, SettingKey, SettingValue, validateSetting } from './defaults';
import { Errors } from '../common/errors';

const CACHE_TTL_MS = 15_000;

/** DB-backed settings with an in-process cache (§4). Writes invalidate locally; other instances refresh within TTL. */
@Injectable()
export class SettingsService {
  private cache: Map<string, unknown> | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const all = await this.load();
    return (all.has(key) ? all.get(key) : SETTING_DEFAULTS[key]) as SettingValue<K>;
  }

  async getAll(): Promise<Record<string, { value: unknown; isDefault: boolean }>> {
    const all = await this.load();
    const out: Record<string, { value: unknown; isDefault: boolean }> = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      out[key] = all.has(key)
        ? { value: all.get(key), isDefault: false }
        : { value: (SETTING_DEFAULTS as Record<string, unknown>)[key], isDefault: true };
    }
    return out;
  }

  async set(key: string, value: unknown, adminId: string | null, tx?: Tx): Promise<void> {
    const err = validateSetting(key, value);
    if (err) throw Errors.invalid('invalid_setting', err);
    const db = tx ?? this.prisma;
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as any, updatedBy: adminId },
      update: { value: value as any, updatedBy: adminId },
    });
    this.invalidate();
  }

  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.loadedAt < CACHE_TTL_MS) return this.cache;
    const rows = await this.prisma.setting.findMany();
    this.cache = new Map(rows.map((r) => [r.key, r.value]));
    this.loadedAt = Date.now();
    return this.cache;
  }
}
