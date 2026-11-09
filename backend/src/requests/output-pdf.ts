// Placeholder output: renders a request document's synthetic summary as a PDF (the final format comes from the
// internal application [OQ]). Plain PDF 1.4 with built-in Helvetica, a table per section and a bookmark per section.
import type { DocumentOutput } from './workflow.js';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const BOTTOM = 60;
const ROW_SIZE = 9.5;
const LINE = 13;
const COLS = [
  { label: 'Date', x: MARGIN },
  { label: 'Page', x: 122 },
  { label: 'Provider', x: 160 },
  { label: 'Excerpt', x: 305 },
];
const EXCERPT_CHARS = 52; // ~257pt of Helvetica at 9.5pt

// Built-in fonts only cover Latin-1; anything else becomes "?". Then escape PDF string syntax.
const pdfText = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/[\\()]/g, (c) => `\\${c}`);
const text = (x: number, y: number, size: number, value: string, bold = false) =>
  `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y.toFixed(1)} Td (${pdfText(value)}) Tj ET`;

function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = '';
    }
    line = line ? `${line} ${word}` : word.slice(0, width);
  }
  return lines.length || line ? [...lines, line].filter(Boolean) : [''];
}

export function outputPdf(meta: { requestCode: string; fileName: string; service: string }, output: DocumentOutput): Buffer {
  const pages: string[][] = [];
  const marks: { title: string; page: number; y: number }[] = [];
  let ops: string[] = [];
  let y = 0;

  const header = () => {
    ops.push(`0.13 0.36 0.80 rg ${MARGIN} ${PAGE_H - 46} ${PAGE_W - 2 * MARGIN} 2 re f 0 0 0 rg`);
    ops.push(text(MARGIN, PAGE_H - 38, 9, `${meta.requestCode}  -  Summary`, true));
  };
  const newPage = () => {
    ops = [];
    pages.push(ops);
    header();
    y = PAGE_H - 70;
  };
  const tableHead = () => {
    ops.push(`0.93 0.95 0.98 rg ${MARGIN} ${(y - 5).toFixed(1)} ${PAGE_W - 2 * MARGIN} 17 re f 0 0 0 rg`);
    for (const c of COLS) ops.push(text(c.x + 3, y, 9, c.label, true));
    y -= 20;
  };

  newPage();
  ops.push(text(MARGIN, y, 18, 'Medical Records Summary', true));
  y -= 22;
  ops.push(text(MARGIN, y, 10, `Request ${meta.requestCode}   |   Source file: ${meta.fileName}`));
  y -= 14;
  ops.push(text(MARGIN, y, 10, `Service: ${meta.service}`));
  y -= 20;
  if (output.synthetic) {
    ops.push(`1 0.95 0.85 rg ${MARGIN} ${(y - 6).toFixed(1)} ${PAGE_W - 2 * MARGIN} 20 re f 0.55 0.33 0 rg`);
    ops.push(text(MARGIN + 8, y, 9.5, 'SYNTHETIC PLACEHOLDER OUTPUT - NOT A REAL PATIENT RECORD', true));
    ops.push('0 0 0 rg');
    y -= 34;
  }

  for (const section of output.sections) {
    if (y - 60 < BOTTOM) newPage();
    marks.push({ title: section.title, page: pages.length - 1, y: y + 16 });
    ops.push(text(MARGIN, y, 12.5, section.title, true));
    y -= 20;
    tableHead();
    for (const e of section.entries) {
      const excerpt = wrap(e.excerpt, EXCERPT_CHARS);
      const height = excerpt.length * LINE + 4;
      if (y - height < BOTTOM) {
        newPage();
        tableHead();
      }
      ops.push(text(COLS[0].x + 3, y, ROW_SIZE, e.date));
      ops.push(text(COLS[1].x + 3, y, ROW_SIZE, String(e.page)));
      ops.push(text(COLS[2].x + 3, y, ROW_SIZE, e.provider.slice(0, 28)));
      excerpt.forEach((line, i) => ops.push(text(COLS[3].x + 3, y - i * LINE, ROW_SIZE, line)));
      y -= height;
      ops.push(`0.88 0.90 0.94 rg ${MARGIN} ${(y + 9).toFixed(1)} ${PAGE_W - 2 * MARGIN} 0.6 re f 0 0 0 rg`);
    }
    y -= 18;
  }
  pages.forEach((p, i) => p.push(`0.45 0.45 0.45 rg`, text(PAGE_W - MARGIN - 60, 34, 8.5, `Page ${i + 1} of ${pages.length}`), '0 0 0 rg'));

  // ---- objects ----
  const objects: string[] = [];
  const add = (body = '') => objects.push(body);
  const catalog = add();
  const tree = add();
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds = pages.map((p) => {
    const stream = p.join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${content} 0 R ` +
        `/Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`,
    );
  });

  // Bookmarks: one per section, opening at its heading.
  const outlines = add();
  const markIds = marks.map(() => add());
  marks.forEach((m, i) => {
    const prev = i > 0 ? ` /Prev ${markIds[i - 1]} 0 R` : '';
    const next = i < marks.length - 1 ? ` /Next ${markIds[i + 1]} 0 R` : '';
    objects[markIds[i] - 1] =
      `<< /Title (${pdfText(m.title)}) /Parent ${outlines} 0 R${prev}${next} /Dest [${pageIds[m.page]} 0 R /XYZ 0 ${m.y.toFixed(0)} 0] >>`;
  });
  objects[outlines - 1] = markIds.length
    ? `<< /Type /Outlines /First ${markIds[0]} 0 R /Last ${markIds.at(-1)} 0 R /Count ${markIds.length} >>`
    : '<< /Type /Outlines /Count 0 >>';
  objects[tree - 1] = `<< /Type /Pages /Kids [${pageIds.map((k) => `${k} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines >>`;
  const info = add(`<< /Title (${pdfText(`${meta.requestCode} - Summary`)}) /Producer (MRRM) >>`);

  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
