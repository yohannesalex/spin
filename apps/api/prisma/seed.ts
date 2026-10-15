/* REQ-ROLE-01: the seed script is one of the two ways an admin account can be created. */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { config } from 'dotenv';

config();
const prisma = new PrismaClient();
const HOUSE_WALLET_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const phone = process.env.SEED_ADMIN_PHONE || '+251911000000';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin12345';
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (!existing) {
    await prisma.user.create({
      data: {
        fullName: process.env.SEED_ADMIN_NAME || 'Platform Admin',
        phone,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`Admin created: ${phone}`);
  } else {
    console.log(`Admin exists: ${phone}`);
  }

  await prisma.wallet.upsert({ where: { id: HOUSE_WALLET_ID }, create: { id: HOUSE_WALLET_ID, kind: 'HOUSE' }, update: {} });

  if ((await prisma.roomTemplate.count()) === 0) {
    await prisma.roomTemplate.createMany({
      data: [
        { name: 'Starter', stakeCents: 5000, capacity: 10, minPlayers: 2, deadlineMinutes: 30 },
        { name: 'Classic', stakeCents: 10000, capacity: 10, minPlayers: 2, deadlineMinutes: 30 },
        { name: 'Big Ten', stakeCents: 20000, capacity: 10, minPlayers: 2 },
        { name: 'High Roller', stakeCents: 50000, capacity: 20, minPlayers: 2, deadlineMinutes: 60 },
        { name: 'Century', stakeCents: 5000, capacity: 100, minPlayers: 10, deadlineMinutes: 120 },
      ],
    });
    console.log('Room templates created');
  }

  const accounts = await prisma.setting.findUnique({ where: { key: 'receivingAccounts' } });
  if (!accounts) {
    // PLACEHOLDERS — replace with the platform's real accounts in Admin → Settings before go-live.
    await prisma.setting.create({
      data: {
        key: 'receivingAccounts',
        value: [
          { provider: 'TELEBIRR', accountNumber: '+251900000001', accountName: 'SPIN DRAW PLC', active: true },
          { provider: 'CBE', accountNumber: '1000000000001', accountName: 'SPIN DRAW PLC', active: true },
        ],
      },
    });
    console.log('Placeholder receiving accounts created — change them in Admin → Settings');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
