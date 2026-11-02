import { prisma } from './db.js';
import { logger } from './logger.js';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEntry {
  event: string;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  organizationId?: string | null;
  objectId?: string | null;
  ip?: string | null;
}

// SEC-02: an audit failure is logged but never blocks the business action.
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({ data: entry });
  } catch (err) {
    logger.error({ err, event: entry.event }, 'audit write failed');
  }
}
