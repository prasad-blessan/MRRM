// Minimal multi-page PDF writer for development seed data. Content is clearly marked synthetic.
const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function syntheticPdf(title: string, pages: number): Buffer {
  const objects: string[] = [];
  // Returns the new object number (1-based).
  const add = (body: string) => objects.push(body);

  const catalog = add('');
  const pageTree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const kids: number[] = [];
  for (let p = 1; p <= pages; p++) {
    const lines = [
      `BT /F2 20 Tf 60 760 Td (${esc(title)}) Tj ET`,
      `BT /F1 12 Tf 60 735 Td (SYNTHETIC TEST DOCUMENT - NOT A REAL PATIENT RECORD) Tj ET`,
      `BT /F1 12 Tf 60 700 Td (Page ${p} of ${pages}) Tj ET`,
      ...Array.from({ length: 18 }, (_, i) => `BT /F1 11 Tf 60 ${660 - i * 28} Td (Sample line ${i + 1}: placeholder clinical text for layout testing.) Tj ET`),
      `0.85 0.89 0.95 rg 60 80 492 1 re f`,
    ].join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(lines)} >>\nstream\n${lines}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R ` +
          `/Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`;

  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
