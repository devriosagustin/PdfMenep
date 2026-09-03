import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForSplit } from '@/lib/business/pdf-format';
import { extractPdfPages, type PageSelection, PdfSplitError } from '@/lib/business/pdf-split';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_PDF_BYTES,
  PageSelectionRaw,
  PDF_MAGIC,
  type PdfSplitFieldErrors,
  PdfSplitInputMeta,
  parseErrorMessage,
  parsePageSelectionString,
} from '@/lib/contracts/pdf-split';
import { friendlySplitError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfSplitFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  selection: PageSelection;
}
interface ReadErr {
  ok: false;
  response: Response;
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlySplitError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlySplitError('no_file'), 400),
    };
  }

  if (entry.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      response: fieldError(friendlySplitError('file_too_big', { mb: 60 }), 413),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfSplitInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlySplitError('filename_too_long', { filename })
        : friendlySplitError('invalid_pdf_meta', { filename });
    return {
      ok: false,
      response: fieldError(reason, 400),
    };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlySplitError('bad_magic', { filename }), 400),
    };
  }

  const rawMode = form.get('mode');
  const rawPages = form.get('pagesRaw');
  const modeValue = typeof rawMode === 'string' && rawMode.length > 0 ? rawMode : 'all';
  const pagesValue = typeof rawPages === 'string' ? rawPages : '';

  const parsedSelection = PageSelectionRaw.safeParse({
    mode: modeValue,
    ...(modeValue === 'pages' ? { pagesRaw: pagesValue } : {}),
  });

  if (!parsedSelection.success) {
    if (modeValue === 'pages') {
      const code = pagesValue.trim().length === 0 ? 'empty_selection' : 'parse_selection';
      return {
        ok: false,
        response: fieldError(friendlySplitError(code), 400),
      };
    }
    return {
      ok: false,
      response: fieldError(friendlySplitError('invalid_selection_mode'), 400),
    };
  }

  let selection: PageSelection;
  if (parsedSelection.data.mode === 'all') {
    selection = { mode: 'all' };
  } else {
    const parsed = parsePageSelectionString(parsedSelection.data.pagesRaw, MAX_PAGES);
    if (!parsed.ok) {
      return {
        ok: false,
        response: fieldError(parseErrorMessage(parsed.error, MAX_PAGES), 400),
      };
    }
    selection = { mode: 'pages', pages: parsed.pages };
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    selection,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await extractPdfPages({
      bytes: upload.bytes,
      selection: upload.selection,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForSplit(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfSplitError) {
      if (err.code === 'timeout') {
        return plainError(friendlySplitError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlySplitError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        const code = err.reason === 'password' ? 'invalid_pdf_password' : 'invalid_pdf_corrupt';
        return fieldError(friendlySplitError(code), 400);
      }
      if (err.code === 'selection_failed') {
        const code = err.reason === 'out_of_range' ? 'out_of_range_selection' : 'selection_failed';
        return fieldError(friendlySplitError(code, { maxPages: MAX_PAGES }), 400);
      }
      return fieldError(friendlySplitError('invalid_pdf_meta', { filename: upload.filename }), 422);
    }
    return plainError(friendlySplitError('unexpected'), 500);
  }
}
