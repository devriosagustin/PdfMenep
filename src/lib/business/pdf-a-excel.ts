import 'server-only';

import JSZip from 'jszip';

import { extractTextFromPdf, PdfExtractTextError } from '@/lib/business/pdf-extract-text';
import { MAX_PAGES } from '@/lib/contracts/pdf-a-excel';

export class PdfToExcelError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'encrypted_pdf'
      | 'empty_pdf'
      | 'too_many_pages'
      | 'convert_failed'
      | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

export interface PdfToExcelResult {
  xlsx: Uint8Array;
  pageCount: number;
  rowCount: number;
}

const CONVERT_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new PdfToExcelError('timeout', 'Conversión de PDF a Excel tardó demasiado')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// XML-safe text escape for inline strings. XLSX is XML — keep the body safe.
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Spreadsheet column-letter conversion: 1 → A, 26 → Z, 27 → AA, 53 → BA.
// Used to build cell refs like `A1`, `C12`. We only ever emit A/B/C so the
// single-letter range always wins, but the helper keeps the cell-mapper
// generic for future expansion.
function columnLetter(col: number): string {
  let n = col;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Hoja1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

function cellInline(ref: string, value: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

interface SheetRow {
  col: string;
  page: string;
  line: string;
  text: string;
}

function buildSheetXml(rows: SheetRow[]): string {
  // Header row: Spanish column titles pinned to A/B/C/D so the .xlsx opens
  // with a familiar layout. Column letters are computed once via columnLetter
  // to keep the layout generic even if more columns land.
  const headerTitles = ['Columna', 'Página', 'Línea #', 'Texto'];
  const headerRow = `<row r="1">${headerTitles
    .map((title, i) => cellInline(`${columnLetter(i + 1)}1`, title))
    .join('')}</row>`;

  const xmlRows: string[] = [headerRow];
  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // +1 for 1-based, +1 offset for the header row
    const cells = [
      cellInline(`${columnLetter(1)}${rowNumber}`, row.col),
      cellInline(`${columnLetter(2)}${rowNumber}`, row.page),
      cellInline(`${columnLetter(3)}${rowNumber}`, row.line),
      cellInline(`${columnLetter(4)}${rowNumber}`, row.text),
    ].join('');
    xmlRows.push(`<row r="${rowNumber}">${cells}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${xmlRows.join('')}</sheetData>
</worksheet>`;
}

export async function convertPdfToXlsx(bytes: Uint8Array): Promise<PdfToExcelResult> {
  const work = (async (): Promise<PdfToExcelResult> => {
    const extracted = await extractTextFromPdf(bytes);
    if (extracted.pageCount > MAX_PAGES) {
      // Re-raise as PdfToExcelError so the route handler can map the cap
      // message to a friendly Spanish cap response.
      throw new PdfToExcelError(
        'too_many_pages',
        `El PDF tiene ${extracted.pageCount} páginas; el máximo permitido es ${MAX_PAGES}`,
      );
    }
    // The extracted text joins pages with `\f` form-feeds (single source of
    // truth shared with the docx / extract-text routes). Splitting on `\f`
    // round-trips cleanly because there's no other source of that char.
    const perPageText = extracted.text.length === 0 ? [] : extracted.text.split('\f');

    const rows: SheetRow[] = [];
    let rowCount = 0;
    perPageText.forEach((pageText, idx) => {
      const pageNo = idx + 1;
      // Per-page header row so the user can tell at a glance which page
      // each block came from once the file is open in Excel/LibreOffice.
      rows.push({
        col: 'encabezado',
        page: `Página ${pageNo}`,
        line: '',
        text: `Página ${pageNo} de ${perPageText.length}`,
      });
      rowCount += 1;

      const lines = pageText.length === 0 ? [] : pageText.split('\n');
      lines.forEach((line, li) => {
        rows.push({
          col: 'línea',
          page: String(pageNo),
          line: String(li + 1),
          text: line,
        });
        rowCount += 1;
      });
    });

    const sheetXml = buildSheetXml(rows);

    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.folder('_rels')?.file('.rels', ROOT_RELS);
    const xlFolder = zip.folder('xl');
    if (!xlFolder) {
      throw new PdfToExcelError('convert_failed', 'No se pudo preparar el XLSX');
    }
    xlFolder.file('workbook.xml', WORKBOOK_XML);
    xlFolder.folder('_rels')?.file('workbook.xml.rels', WORKBOOK_RELS);
    xlFolder.folder('worksheets')?.file('sheet1.xml', sheetXml);

    const archive = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    });
    return {
      xlsx: archive,
      pageCount: extracted.pageCount,
      rowCount,
    };
  })();

  try {
    return await raceTimeout(work, CONVERT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof PdfToExcelError) throw err;
    if (err instanceof PdfExtractTextError) {
      if (err.code === 'timeout') {
        throw new PdfToExcelError('timeout', err.message);
      }
      if (err.code === 'encrypted_pdf') {
        throw new PdfToExcelError('encrypted_pdf', 'El PDF está protegido con contraseña');
      }
      if (err.code === 'empty_pdf') {
        throw new PdfToExcelError('empty_pdf', 'El PDF no tiene páginas');
      }
      throw new PdfToExcelError('invalid_pdf', err.message);
    }
    throw new PdfToExcelError('convert_failed', 'No se pudo convertir el PDF a Excel');
  }
}

// Re-export for tests that want to assert on the underlying PDF text walker
// without spinning up a XLSX ZIP.
export { extractTextFromPdf };
