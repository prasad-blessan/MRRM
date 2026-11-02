import type { EmailTokenPurpose } from '@prisma/client';
import { prisma } from '../db.js';
import { generateToken, hashToken } from './crypto.js';

// REG-08: issuing a new link invalidates earlier unused links for the same purpose.
export async function issueEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMs: number): Promise<string> {
  const token = generateToken();
  await prisma.$transaction([
    prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.emailToken.create({
      data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ]);
  return token;
}

// Marks the token used and returns its user ID, or null if it is unknown, used or expired.
export async function consumeEmailToken(token: string, purpose: EmailTokenPurpose): Promise<string | null> {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt <= new Date()) return null;

  const claimed = await prisma.emailToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? record.userId : null;
}
