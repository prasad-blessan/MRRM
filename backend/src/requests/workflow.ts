import type { Prisma, RequestStatus } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';

// Workflow Monitor stages; `Request.stage` is the index of the active one (5 = all done).
export const STAGES = ['Allocation', 'Indexing', 'Summarization', 'QC', 'Final Output'] as const;
export const DONE_STAGE = STAGES.length;

// Business status shown while each stage is active.
const STAGE_STATUS: RequestStatus[] = ['RECEIVED', 'IN_PROCESSING', 'SUMMARIZATION', 'QC_VERIFICATION', 'QC_VERIFICATION'];

// Dashboard tiles (DSH-01) group the PRD 7.2 statuses.
export const STATUS_GROUPS = {
  pending: ['RECEIVED', 'ON_HOLD'],
  inProgress: ['ALLOCATED', 'IN_PROCESSING', 'SUMMARIZATION', 'QC_VERIFICATION', 'REWORK'],
  completed: ['DELIVERED', 'COMPLETED'],
  closed: ['REJECTED', 'CANCELLED'],
} satisfies Record<string, RequestStatus[]>;
export type StatusGroup = keyof typeof STATUS_GROUPS;

export const OUTPUT_READY: RequestStatus[] = STATUS_GROUPS.completed;
// TRK: a request can be cancelled until work has started.
export const CANCELLABLE: RequestStatus[] = ['RECEIVED', 'ALLOCATED'];

export const requestCode = (number: number) => `MR-${1000 + number}`;

// ---- Synthetic output (development and demo data only; no real patient content) ----

export interface OutputEntry {
  date: string;
  page: number;
  provider: string;
  excerpt: string;
}
export interface OutputSection {
  title: string;
  entries: OutputEntry[];
}
export interface DocumentOutput {
  synthetic: true;
  sections: OutputSection[];
}

const PROVIDERS = ['Synthetic Family Clinic', 'Test General Hospital', 'Sample Imaging Center', 'Demo Physical Therapy', 'Example Urgent Care'];
const SECTIONS: { title: string; excerpts: string[] }[] = [
  {
    title: 'Indexing of Medical Records',
    excerpts: ['Initial consultation record.', 'Intake questionnaire and history form.', 'Medication list reviewed.', 'Referral letter on file.'],
  },
  {
    title: 'Chronological Timeline',
    excerpts: [
      'Follow-up visit; vitals recorded, no acute distress noted.',
      'Patient reports improvement since previous visit.',
      'Plan of care reviewed; return in four weeks.',
      'Therapy session completed; home exercises updated.',
    ],
  },
  {
    title: 'Reports',
    excerpts: ['Imaging report: no acute findings.', 'Laboratory panel within reference range.', 'Specialist report received and filed.'],
  },
  {
    title: 'General / Misc',
    excerpts: ['Billing summary page.', 'Correspondence with provider office.', 'Records request cover sheet.'],
  },
];

// Small deterministic generator so a document's output is stable across runs.
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function syntheticOutput(documentId: string, pages: number, from: Date): DocumentOutput {
  const rand = seeded(documentId);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  let day = new Date(from.getTime() - 400 * 86_400_000);

  const sections = SECTIONS.map(({ title, excerpts }) => {
    const count = Math.min(12, Math.max(2, Math.round(pages / 8 + rand() * 3)));
    const entries = Array.from({ length: count }, () => {
      day = new Date(day.getTime() + Math.ceil(rand() * 20) * 86_400_000);
      return {
        date: day.toISOString().slice(0, 10),
        page: 1 + Math.floor(rand() * pages),
        provider: pick(PROVIDERS),
        excerpt: pick(excerpts),
      };
    });
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.page - b.page);
    return { title, entries };
  });
  return { synthetic: true, sections };
}

// Delivers the request: every document gets its output, then status DELIVERED (DEL-01).
export async function deliver(tx: Prisma.TransactionClient, requestId: string, now = new Date()) {
  const docs = await tx.requestDocument.findMany({ where: { requestId }, select: { id: true, pages: true } });
  for (const doc of docs) {
    await tx.requestDocument.update({
      where: { id: doc.id },
      data: { output: syntheticOutput(doc.id, doc.pages, now) as unknown as Prisma.InputJsonValue, outputAt: now },
    });
  }
  await tx.request.update({
    where: { id: requestId },
    data: { status: 'DELIVERED', stage: DONE_STAGE, stageProgress: 100, deliveredAt: now },
  });
  await tx.statusEvent.create({ data: { requestId, status: 'DELIVERED', occurredAt: now } });
}

// ---- Development simulator: moves recent requests through the stages ----

const TICK_MS = 5_000;
const WINDOW_MS = 60 * 60_000;

async function tick() {
  const active = await prisma.request.findMany({
    where: {
      status: { in: [...STATUS_GROUPS.pending.filter((s) => s !== 'ON_HOLD'), ...STATUS_GROUPS.inProgress] },
      stage: { lt: DONE_STAGE },
      receivedAt: { gt: new Date(Date.now() - WINDOW_MS) },
    },
    select: { id: true, stage: true, stageProgress: true, status: true },
  });

  for (const req of active) {
    const progress = Math.min(100, req.stageProgress + 20 + Math.floor(Math.random() * 15));
    await prisma.$transaction(async (tx) => {
      if (progress < 100) {
        await tx.request.update({ where: { id: req.id }, data: { stageProgress: progress } });
        return;
      }
      const next = req.stage + 1;
      if (next === DONE_STAGE) return deliver(tx, req.id);

      // Allocation finishing records ALLOCATED before indexing starts (PRD 7.2 order).
      if (req.stage === 0) await tx.statusEvent.create({ data: { requestId: req.id, status: 'ALLOCATED' } });
      const status = STAGE_STATUS[next];
      await tx.request.update({ where: { id: req.id }, data: { stage: next, stageProgress: 0, status } });
      if (status !== req.status) await tx.statusEvent.create({ data: { requestId: req.id, status } });
    });
  }
}

export function startSimulator() {
  logger.warn('SIMULATE_WORKFLOW is on: recent requests advance automatically with synthetic output');
  const timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'workflow simulator tick failed'));
  }, TICK_MS);
  timer.unref();
}
