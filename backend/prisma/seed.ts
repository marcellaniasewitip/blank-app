/**
 * Seed (§13): permissions + default roles, one admin per role, notification templates, platform wallet,
 * 2 depots, 3 packages, 5 approved drivers near Port Moresby (−9.4438, 147.1803), 5 customers.
 * Idempotent: safe to run repeatedly. Depot locations and package prices are placeholders — [CONFIRM].
 *
 *   SEED_ADMIN_PASSWORD   password for seeded admins (required when NODE_ENV=production)
 *   SEED_DEMO_DATA=false  only seed permissions/roles/admins/templates (use for production)
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES, PERMISSIONS } from '../src/auth/permissions';
import { DEFAULT_TEMPLATES } from '../src/notifications/templates';

const prisma = new PrismaClient();
const PLATFORM_OWNER_ID = '00000000-0000-0000-0000-000000000000';
const CENTRE = { lat: -9.4438, lng: 147.1803 };

async function main(): Promise<void> {
  const prod = process.env.NODE_ENV === 'production';
  const password = process.env.SEED_ADMIN_PASSWORD ?? (prod ? undefined : 'CooperWaters2024!');
  if (!password) throw new Error('Set SEED_ADMIN_PASSWORD to seed admins in production');
  const demo = process.env.SEED_DEMO_DATA ? process.env.SEED_DEMO_DATA === 'true' : !prod;

  // ── RBAC ──
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    const role = await prisma.role.upsert({ where: { name }, create: { name, description: def.description, isSystem: true }, update: {} });
    // Only fill permissions on first creation so admin edits survive re-seeding.
    if ((await prisma.rolePermission.count({ where: { roleId: role.id } })) === 0) {
      await prisma.rolePermission.createMany({ data: def.permissions.map((k) => ({ roleId: role.id, permissionId: perms.get(k)! })) });
    }
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@cooperwaters.com.pg`;
    await prisma.adminUser.upsert({ where: { email }, create: { email, name: `${name} (seed)`, passwordHash, roleId: role.id }, update: {} });
  }

  // ── Templates & platform wallet ──
  for (const t of DEFAULT_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: t.key },
      create: { key: t.key, pushTitle: t.pushTitle, pushBody: t.pushBody, smsBody: t.smsBody, critical: t.critical },
      update: {},
    });
  }
  await prisma.wallet.upsert({ where: { ownerType_ownerId: { ownerType: 'platform', ownerId: PLATFORM_OWNER_ID } }, create: { ownerType: 'platform', ownerId: PLATFORM_OWNER_ID }, update: {} });

  if (!demo) {
    console.log('Seeded RBAC, admins and templates (no demo data).');
    return;
  }

  // ── Catalogue ([CONFIRM] real depots & prices) ──
  const depots = [
    { name: 'Gerehu Depot', lat: -9.4020, lng: 147.1620 },
    { name: 'Town Depot', lat: CENTRE.lat, lng: CENTRE.lng },
  ];
  for (const d of depots) {
    const existing = await prisma.depot.findFirst({ where: { name: d.name } });
    if (!existing) await prisma.depot.create({ data: d });
  }
  const packages = [
    { name: 'Small tank (1,000 L)', volumeLitres: 1000, priceToea: 8000, sortOrder: 1 },
    { name: 'Medium tank (3,000 L)', volumeLitres: 3000, priceToea: 20000, sortOrder: 2 },
    { name: 'Full truck (5,000 L)', volumeLitres: 5000, priceToea: 30000, sortOrder: 3 },
  ];
  for (const p of packages) {
    const existing = await prisma.package.findFirst({ where: { name: p.name } });
    if (!existing) await prisma.package.create({ data: p });
  }

  // ── 5 approved drivers, each with a truck, approved docs and a K200 wallet ──
  const docTypes = ['drivers_licence', 'vehicle_registration', 'national_id', 'truck_photo'];
  for (let i = 1; i <= 5; i++) {
    const phone = `+6757000000${i}`;
    const user = await prisma.user.upsert({
      where: { phone },
      create: { phone, role: 'driver', name: `Driver ${i}`, phoneVerifiedAt: new Date() },
      update: {},
    });
    const driver = await prisma.driver.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: 'approved',
        online: false,
        // Spread ~0.5–2.5 km around the centre.
        currentLat: CENTRE.lat + (i - 3) * 0.005,
        currentLng: CENTRE.lng + ((i % 2) * 2 - 1) * 0.005,
        lastSeenAt: new Date(),
      },
      update: {},
    });
    if ((await prisma.truck.count({ where: { driverId: driver.id } })) === 0) {
      await prisma.truck.create({ data: { driverId: driver.id, plate: `CW${100 + i}`, capacityLitres: 5000 } });
    }
    for (const type of docTypes) {
      if ((await prisma.driverDocument.count({ where: { driverId: driver.id, type } })) === 0) {
        await prisma.driverDocument.create({ data: { driverId: driver.id, type, fileKey: `driver-documents/${driver.id}/seed-${type}.jpg`, status: 'approved', reviewedAt: new Date() } });
      }
    }
    const wallet = await prisma.wallet.upsert({
      where: { ownerType_ownerId: { ownerType: 'driver', ownerId: driver.id } },
      create: { ownerType: 'driver', ownerId: driver.id },
      update: {},
    });
    const key = `seed-topup:${driver.id}`;
    if (!(await prisma.ledgerEntry.findUnique({ where: { idempotencyKey: key } }))) {
      await prisma.$transaction(async (tx) => {
        const w = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
        const amount = 20000;
        await tx.ledgerEntry.create({
          data: { walletId: w.id, amountToea: amount, balanceAfter: w.balanceToea + amount, type: 'topup', referenceType: 'seed', referenceId: driver.id, idempotencyKey: key, createdBy: 'system', description: 'Seed balance' },
        });
        await tx.wallet.update({ where: { id: w.id }, data: { balanceToea: w.balanceToea + amount } });
      });
    }
  }

  // ── 5 customers with a saved location each ──
  for (let i = 1; i <= 5; i++) {
    const phone = `+6757100000${i}`;
    const user = await prisma.user.upsert({ where: { phone }, create: { phone, role: 'customer', name: `Customer ${i}`, phoneVerifiedAt: new Date() }, update: {} });
    if ((await prisma.customerLocation.count({ where: { userId: user.id } })) === 0) {
      await prisma.customerLocation.create({
        data: {
          userId: user.id,
          label: 'Home',
          addressText: `Section ${10 + i}, Lot ${i}, Boroko`,
          lat: CENTRE.lat + i * 0.003,
          lng: CENTRE.lng - i * 0.002,
          landmarkNotes: 'Blue gate opposite the trade store',
        },
      });
    }
  }
  console.log('Seed complete. Admin logins: <role>@cooperwaters.com.pg (e.g. super.admin@cooperwaters.com.pg).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
