import argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';

export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

// Common base words; a password that is one of these plus digits/symbols is rejected (REG-09).
const COMMON_BASES = [
  'password', 'welcome', 'qwerty', 'qwertyuiop', 'asdfgh', 'letmein', 'admin', 'administrator',
  'changeme', 'iloveyou', 'abc123', 'abcdef', 'monkey', 'dragon', 'football', 'baseball', 'sunshine',
  'princess', 'trustno1', 'master', 'login', 'secret', 'summer', 'winter', 'spring', 'autumn', 'india',
  'levelshift', 'mrrm', 'insurance', 'medical', 'hello', 'test', 'default', 'user', 'guest',
];
const COMMON_EXACT = new Set([
  '123456789012', '1234567890123', '12345678901234', '111111111111', '000000000000', '123123123123',
  'qwertyuiop12', '1q2w3e4r5t6y', 'q1w2e3r4t5y6', 'zaq12wsxcde3', '1qaz2wsx3edc', 'aaaaaaaaaaaa',
  'passwordpassword', 'iloveyouiloveyou', 'qwertyqwerty', 'abcdefghijkl', 'abcd1234abcd',
]);

export type PasswordProblem = 'TOO_SHORT' | 'TOO_LONG' | 'TOO_SIMPLE' | 'COMMON' | 'CONTAINS_EMAIL';

const MESSAGES: Record<PasswordProblem, string> = {
  TOO_SHORT: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  TOO_LONG: `Use no more than ${PASSWORD_MAX_LENGTH} characters.`,
  TOO_SIMPLE: 'Use at least 3 of these: upper-case letters, lower-case letters, numbers and symbols.',
  COMMON: 'This password is too common. Choose something harder to guess.',
  CONTAINS_EMAIL: 'Do not use your email address in your password.',
};

export function passwordProblemMessage(problem: PasswordProblem): string {
  return MESSAGES[problem];
}

const LEET: Record<string, string> = { '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't' };

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

// "P@ssw0rd2026!" -> "password": drop the trailing digits/symbols, then undo common substitutions.
const deLeet = (s: string) =>
  lettersOnly(
    s
      .toLowerCase()
      .replace(/[^a-z]+$/, '')
      .replace(/[@4013!$57]/g, (c) => LEET[c]),
  );

// Matches passwords made only of common words, e.g. "Welcome@2026!" or "AdminAdmin#99".
const COMMON_WORDS_ONLY = new RegExp(`^(${[...new Set(COMMON_BASES.map(lettersOnly))].join('|')})+$`);

function isCommon(password: string): boolean {
  if (COMMON_EXACT.has(password.toLowerCase())) return true;
  return [lettersOnly(password), deLeet(password)].some((w) => w.length > 0 && COMMON_WORDS_ONLY.test(w));
}

// REG-09 policy checks that do not need the database.
export function checkPasswordPolicy(password: string, email?: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'TOO_SHORT';
  if (password.length > PASSWORD_MAX_LENGTH) return 'TOO_LONG';
  const classes = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) return 'TOO_SIMPLE';
  if (isCommon(password)) return 'COMMON';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return 'CONTAINS_EMAIL';
  return null;
}

export async function isRecentlyUsed(userId: string, password: string): Promise<boolean> {
  if (config.PASSWORD_HISTORY_COUNT === 0) return false;
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: config.PASSWORD_HISTORY_COUNT,
  });
  for (const entry of history) {
    if (await argon2.verify(entry.passwordHash, password)) return true;
  }
  return false;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

// Records the new hash in history; call inside the transaction that sets User.passwordHash.
export function recordPasswordHistory(tx: Prisma.TransactionClient, userId: string, passwordHash: string) {
  return tx.passwordHistory.create({ data: { userId, passwordHash } });
}
