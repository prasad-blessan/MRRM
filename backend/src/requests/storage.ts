import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

// Layout under STORAGE_DIR (a storage key is a path relative to it):
//   staging/<uuid>              upload in transit (multer writes here, deleted if rejected)
//   pending/<uuid>              accepted upload, not yet submitted
//   files/<request ID>/<name>   submitted document, under its uploaded name and format
export const storageRoot = path.resolve(config.STORAGE_DIR);
export const stagingDir = path.join(storageRoot, 'staging');
export const pendingDir = path.join(storageRoot, 'pending');
export const filesDir = path.join(storageRoot, 'files');

export async function ensureStorage(): Promise<void> {
  await mkdir(stagingDir, { recursive: true });
  await mkdir(pendingDir, { recursive: true });
  await mkdir(filesDir, { recursive: true });
}

export function filePath(storageKey: string): string {
  const full = path.resolve(storageRoot, storageKey);
  // A key can never point outside the storage folder.
  if (!full.startsWith(storageRoot + path.sep)) throw new Error('Invalid storage key');
  return full;
}

const toKey = (full: string) => path.relative(storageRoot, full).split(path.sep).join('/');

// The uploaded name, made safe as a Windows/Linux file name: no folders, reserved characters or reserved names.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
export function safeFileName(name: string): string {
  let base = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  const ext = path.extname(base);
  let stem = base.slice(0, base.length - ext.length);
  if (!stem || RESERVED.test(stem)) stem = `file${stem ? `_${stem}` : ''}`;
  // Keep the whole name within common file-system limits, extension included.
  base = stem.slice(0, 180 - ext.length) + ext;
  return base;
}

// Unique within one request folder (case-insensitive, as on Windows): "name.pdf", "name (2).pdf", ...
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const safe = safeFileName(name);
    const ext = path.extname(safe);
    const stem = safe.slice(0, safe.length - ext.length);
    let candidate = safe;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export const requestFileKey = (requestCode: string, fileName: string) => toKey(path.join(filesDir, requestCode, fileName));

// SUB-05: the type is decided by the file's content, not its extension or the browser's claim.
const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'image/tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
];
const EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tif', '.tiff'],
};

export async function detectType(file: string, originalName: string): Promise<string | null> {
  const handle = await open(file, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(8), 0, 8, 0);
    const head = buffer.subarray(0, bytesRead);
    const match = SIGNATURES.find((s) => s.bytes.every((b, i) => head[i] === b));
    if (!match) return null;
    const ext = path.extname(originalName).toLowerCase();
    return EXTENSIONS[match.mime].includes(ext) ? match.mime : null;
  } finally {
    await handle.close();
  }
}

// Counts page objects while streaming, so large PDFs are never held in memory.
export function countPdfPages(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let pages = 0;
    let tail = '';
    createReadStream(file, { encoding: 'latin1', highWaterMark: 1 << 20 })
      .on('data', (chunk) => {
        const text = tail + chunk;
        // A match may straddle the chunk boundary; only count matches that end before the carried tail.
        const limit = text.length - 32;
        for (const m of text.matchAll(/\/Type\s*\/Page(?![a-zA-Z])/g)) {
          if (m.index + m[0].length <= limit) pages++;
        }
        tail = text.slice(Math.max(0, limit));
      })
      .on('end', () => {
        pages += tail.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
        resolve(Math.max(1, pages));
      })
      .on('error', reject);
  });
}

// Accepted upload: staging -> pending/<uuid>. Returns its storage key.
export async function moveToPending(stagedFile: string): Promise<string> {
  const target = path.join(pendingDir, randomUUID());
  await rename(stagedFile, target);
  return toKey(target);
}

// Submit: moves each pending upload into files/<request ID>/<name>. All or nothing: on failure the files
// already moved go back and the request folder is removed, so the caller's transaction can roll back.
export async function moveToRequestFolder(requestCode: string, moves: { from: string; to: string }[]): Promise<void> {
  const folder = path.join(filesDir, requestCode);
  await mkdir(folder, { recursive: true });
  const done: { from: string; to: string }[] = [];
  try {
    for (const m of moves) {
      await rename(filePath(m.from), filePath(m.to));
      done.push(m);
    }
  } catch (err) {
    for (const m of done.reverse()) await rename(filePath(m.to), filePath(m.from)).catch(() => undefined);
    await rm(folder, { recursive: true, force: true });
    throw err;
  }
}

export async function removeFile(file: string): Promise<void> {
  await rm(file, { force: true });
}
