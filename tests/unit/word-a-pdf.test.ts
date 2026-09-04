// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import JSZip from 'jszip';
import { convertDocxToPdf, walkDocumentXml } from '../../src/lib/business/word-a-pdf';
import {
  DOCX_MAGIC,
  DocxToPdfFieldErrors,
  DocxToPdfInputMeta,
  DocxToPdfServerError,
  isDocxMagic,
  MAX_FILENAME_LEN,
  MAX_UPLOAD_BYTES,
} from '../../src/lib/contracts/word-a-pdf';
import { friendlyDocxToPdfError } from '../../src/lib/errors/friendly';

const PDF_MAGIC = '%PDF-';

function xmlTextEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function buildDocxFixture(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t xml:space="preserve">${xmlTextEscape(text)}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  zip.folder('word')?.file('document.xml', xml);
  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return buf;
}

async function buildDocxWithParagraphs(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${xmlTextEscape(p)}</w:t></w:r></w:p>`).join('\n')}
  </w:body>
</w:document>`;
  zip.folder('word')?.file('document.xml', xml);
  const buf = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return buf;
}

describe('word-a-pdf contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_UPLOAD_BYTES).toBe(45 * 1024 * 1024); // PRO ceiling (FREE 15 MB x3)
    expect(DOCX_MAGIC.length).toBe(4);
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('isDocxMagic recognises the PK\\x03\\x04 ZIP magic + rejects plain PDFs', () => {
    // PK\x03\x04 byte values
    expect(DOCX_MAGIC[0]).toBe(0x50);
    expect(DOCX_MAGIC[1]).toBe(0x4b);
    expect(DOCX_MAGIC[2]).toBe(0x03);
    expect(DOCX_MAGIC[3]).toBe(0x04);
    const pdf = new TextEncoder().encode('%PDF-1.4\n');
    expect(isDocxMagic(pdf)).toBe(false);
    const docx = new Uint8Array(DOCX_MAGIC);
    expect(isDocxMagic(docx)).toBe(true);
  });

  it('accepts a valid DocxToPdfInputMeta', () => {
    const result = DocxToPdfInputMeta.safeParse({ filename: 'a.docx', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.docx`;
    const result = DocxToPdfInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_UPLOAD_BYTES', () => {
    const result = DocxToPdfInputMeta.safeParse({
      filename: 'big.docx',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = DocxToPdfInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = DocxToPdfFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = DocxToPdfServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('word-a-pdf > friendlyDocxToPdfError', () => {
  it('emits the expected Spanish message for each code (exhaustive)', () => {
    const samples: Array<[string, string]> = [
      ['read_form_failed', 'No se pudo leer el formulario'],
      ['no_file', 'Sube un archivo DOCX en el campo "file"'],
      ['bad_magic', 'El archivo no es un DOCX válido'],
      ['docx_parse_failed', 'No se pudo leer el DOCX'],
      ['docx_no_document', 'El DOCX no contiene el documento principal'],
      ['docx_protected', 'El DOCX está protegido con contraseña'],
      ['convert_failed', 'No se pudo convertir el DOCX a PDF'],
      ['timeout', 'Conversión de DOCX a PDF tardó demasiado'],
      ['unexpected', 'No se pudo convertir el DOCX a PDF'],
    ];
    for (const [code, expected] of samples) {
      expect(friendlyDocxToPdfError(code as never)).toContain(expected);
    }
  });

  it('embeds the filename in messages that take `{ filename }`', () => {
    const msg = friendlyDocxToPdfError('file_too_big', { filename: 'carta.docx', mb: 15 });
    expect(msg).toContain('carta.docx');
    expect(msg).toContain('15 MB');
  });
});

describe('word-a-pdf > convertDocxToPdf', () => {
  it('produces a valid PDF whose first bytes are %PDF-', async () => {
    const bytes = await buildDocxFixture('Hola mundo');
    const result = await convertDocxToPdf(bytes);
    expect(result.pdf.byteLength).toBeGreaterThan(0);
    const head = String.fromCharCode(
      result.pdf[0] ?? 0,
      result.pdf[1] ?? 0,
      result.pdf[2] ?? 0,
      result.pdf[3] ?? 0,
      result.pdf[4] ?? 0,
    );
    expect(head).toBe(PDF_MAGIC);
  });

  it('emits one PDF page or more per source paragraph (small fixture)', async () => {
    const paragraphs = ['Hola', 'Mundo', 'Cruel'];
    const bytes = await buildDocxWithParagraphs(paragraphs);
    const result = await convertDocxToPdf(bytes);
    expect(result.pageCount).toBeGreaterThanOrEqual(paragraphs.length);
  });

  it('preserves the source text in bodyText for the simple fixture', async () => {
    const bytes = await buildDocxFixture('HONGO EXACTO');
    const result = await convertDocxToPdf(bytes);
    expect(result.bodyText).toContain('HONGO EXACTO');
  });

  it('preserves multiple-paragraph text in bodyText', async () => {
    const bytes = await buildDocxWithParagraphs(['Primero', 'Segundo', 'Tercero']);
    const result = await convertDocxToPdf(bytes);
    expect(result.bodyText).toContain('Primero');
    expect(result.bodyText).toContain('Segundo');
    expect(result.bodyText).toContain('Tercero');
  });
});

describe('word-a-pdf > walkDocumentXml (regex walker)', () => {
  it('emits a text entry + paragraph for a simple doc body', () => {
    const xml = `<w:document xmlns:w="http://x"><w:body><w:p><w:r><w:t>Hola</w:t></w:r></w:p></w:body></w:document>`;
    const entries = walkDocumentXml(xml);
    const texts = entries
      .filter((e) => e.type === 'text')
      .map((e) => {
        if (e.type === 'text') return e.value;
        return '';
      });
    expect(texts.join('')).toBe('Hola');
    expect(entries.some((e) => e.type === 'paragraph')).toBe(true);
  });

  it('handles <w:t xml:space="preserve"> with attribute noise', () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t xml:space="preserve">A B C</w:t></w:r></w:p></w:body></w:document>`;
    const entries = walkDocumentXml(xml);
    const texts = entries
      .filter((e) => e.type === 'text')
      .map((e) => {
        if (e.type === 'text') return e.value;
        return '';
      });
    expect(texts.join('')).toContain('A B C');
  });
});
