// Development only: deletes every request, its status history and documents, and empties the storage folder
// (files/<request ID>/, pending, staging), so `npm run db:seed` can add the sample requests again. Never run against production.
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/db.js';
import { filesDir, pendingDir, stagingDir } from '../src/requests/storage.js';

async function emptyDir(dir: string): Promise<number> {
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.map((name) => rm(path.join(dir, name), { recursive: true, force: true })));
  return names.length;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset requests in production');
  const [events, documents, requests] = await prisma.$transaction([
    prisma.statusEvent.deleteMany(),
    prisma.requestDocument.deleteMany(),
    prisma.request.deleteMany(),
  ]);
  // Next request is MR-1001 again.
  await prisma.$executeRaw`SELECT setval('requests_number_seq', 1, false)`;
  const folders = await emptyDir(filesDir);
  const pending = await emptyDir(pendingDir);
  const staged = await emptyDir(stagingDir);
  console.log(
    `Deleted ${requests.count} requests, ${documents.count} documents, ${events.count} status events, ` +
      `${folders} request folders, ${pending} pending and ${staged} staged files`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
