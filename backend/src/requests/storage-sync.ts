// Development only: keeps the records in step with storage/files when someone deletes there by hand.
//   folder files/<request ID>/ deleted         -> the request and its history are removed
//   one file inside the folder deleted          -> that document is removed (the request goes too if none are left)
// Never enabled in production: records there are evidence and must not vanish because a file did.
import { watch } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { filePath, filesDir } from './storage.js';

const SCAN_MS = 15_000;
const exists = (p: string) => access(p).then(() => true, () => false);

export async function syncDeletedFiles(): Promise<void> {
  // The whole files folder missing or unreadable looks like a wrong STORAGE_DIR or an unmounted drive, not a deletion.
  const folders = await readdir(filesDir).catch(() => null);
  if (!folders) return logger.warn({ filesDir }, 'storage sync skipped: files folder is missing');

  // Only submitted documents live under files/; uploads still in pending/ or staging/ are left alone.
  const docs = await prisma.requestDocument.findMany({
    where: { storageKey: { startsWith: 'files/' } },
    select: { id: true, storageKey: true, request: { select: { id: true, code: true } } },
  });
  const missing = [];
  for (const d of docs) if (d.request && !(await exists(filePath(d.storageKey)))) missing.push({ ...d, request: d.request });
  if (!missing.length) return;

  const byRequest = new Map<string, typeof missing>();
  for (const d of missing) byRequest.set(d.request.id, [...(byRequest.get(d.request.id) ?? []), d]);
  for (const [requestId, gone] of byRequest) {
    const code = gone[0].request.code;
    const removed = await prisma.$transaction(async (tx) => {
      await tx.requestDocument.deleteMany({ where: { id: { in: gone.map((d) => d.id) } } });
      if (await tx.requestDocument.count({ where: { requestId } })) return 'documents';
      await tx.statusEvent.deleteMany({ where: { requestId } });
      await tx.request.delete({ where: { id: requestId } });
      return 'request';
    });
    logger.warn({ request: code, files: gone.length, removed }, 'storage sync: files deleted from disk, records removed');
    await audit({ event: removed === 'request' ? 'REQUEST_REMOVED_FILES_DELETED' : 'DOCUMENTS_REMOVED_FILES_DELETED', outcome: 'SUCCESS', objectId: code });
  }
}

export function startStorageSync() {
  logger.warn('Storage sync is on: deleting a request folder in storage/files removes that request from the app');
  let running = false;
  let again = false;
  const run = () => {
    if (running) return void (again = true);
    running = true;
    syncDeletedFiles()
      .catch((err) => logger.error({ err }, 'storage sync failed'))
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          run();
        }
      });
  };
  run();
  // React within a second of a deletion; the timer is the fallback where file watching is unreliable.
  let debounce: NodeJS.Timeout | undefined;
  try {
    watch(filesDir, { recursive: true }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(run, 1_000);
    }).on('error', (err) => logger.warn({ err }, 'storage sync: file watching stopped; periodic scan continues'));
  } catch (err) {
    logger.warn({ err }, 'storage sync: file watching unavailable; periodic scan only');
  }
  setInterval(run, SCAN_MS).unref();
}
