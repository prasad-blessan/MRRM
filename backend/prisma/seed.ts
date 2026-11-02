// Development seed: synthetic accounts only (PRD 12.2). Never run against production.
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in backend/.env`);
  return value;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'ABC Insurance (test)',
      type: 'CLIENT',
      status: 'ACTIVE',
      timezone: 'America/New_York',
    },
  });

  const users = [
    {
      email: 'admin@mrrm.test',
      fullName: 'Test Admin',
      role: 'LS_ADMIN' as const,
      organizationId: null,
      password: requireEnv('SEED_ADMIN_PASSWORD'),
    },
    {
      email: 'client@abc-insurance.test',
      fullName: 'Test Client User',
      role: 'CLIENT_USER' as const,
      organizationId: org.id,
      password: requireEnv('SEED_CLIENT_PASSWORD'),
    },
  ];

  for (const { password, ...user } of users) {
    const passwordHash = await argon2.hash(password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
      create: { ...user, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    console.log(`Seeded ${user.role}: ${user.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
