import type { NextFunction, Request, Response } from 'express';
import type { Organization, User, UserRole } from '@prisma/client';
import { audit } from '../audit.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { hashToken } from './crypto.js';

export const SESSION_COOKIE = 'mrrm_sid';

export interface AuthContext {
  sessionId: string;
  idleExpiresAt: Date;
  user: User & { organization: Organization | null };
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: config.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
}

// Loads the session from the cookie and slides the idle timeout (REG-11).
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) return next();

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { organization: true } } },
  });
  const now = new Date();
  if (
    !session ||
    session.revokedAt ||
    session.idleExpiresAt <= now ||
    session.absoluteExpiresAt <= now ||
    session.user.status !== 'ACTIVE' ||
    (session.user.organization && session.user.organization.status !== 'ACTIVE')
  ) {
    return next();
  }

  const idleExpiresAt = new Date(
    Math.min(now.getTime() + config.SESSION_IDLE_MINUTES * 60_000, session.absoluteExpiresAt.getTime()),
  );
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now, idleExpiresAt } });

  req.auth = { sessionId: session.id, idleExpiresAt, user: session.user };
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Your session has ended. Please sign in again.' } });
    return;
  }
  next();
}

// SEC-10: role checks are enforced on the server, never only in the UI.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Your session has ended. Please sign in again.' } });
      return;
    }
    if (!roles.includes(req.auth.user.role)) {
      void audit({
        event: 'ACCESS_DENIED',
        outcome: 'DENIED',
        actorUserId: req.auth.user.id,
        organizationId: req.auth.user.organizationId,
        objectId: req.originalUrl.slice(0, 200),
        ip: req.ip ?? null,
      });
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have access to this page.' } });
      return;
    }
    next();
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}
