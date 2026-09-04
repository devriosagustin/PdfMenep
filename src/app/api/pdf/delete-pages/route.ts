import 'server-only';
import { NextResponse } from 'next/server';
import { deletePdfPages, PdfDeletePagesError } from '@/lib/business/pdf-delete-pages';
import { downloadNameForDeletePages } from '@/lib/business/pdf-format';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_DELETE_PAGES_BYTES,
  MAX_DELETE_PAGES_BYTES,
  MAX_FILENAME_LEN,
  MAX_PAGES,
  PDF_MAGIC,
  type PdfDeletePagesFieldErrors,
  PdfDeletePagesInputMeta,
  PdfDeletePagesList,
} from '@/lib/contracts/pdf-delete-pages';
import { friendlyDeletePagesError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfDeletePagesFieldErrors>({ errors: { file: message } }, { status });
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
  pages: number[];
}
interface ReadErr {
  ok: false;
  response: Response;
}

// Map a failed `PdfDeletePagesList` parse to the Spanish copy the client
// preview panel renders inline. We translate the schema's `custom` issues
// (invalid_json / invalid_shape / duplicate / exceeded MAX_PAGES) into the
// friendly mapper codes so the two sides agree exactly.
function mapPagesParseError(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return friendlyDeletePagesError('empty_selection');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return friendlyDeletePagesError('invalid_page_list');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return friendlyDeletePagesError('empty_selection');
  }
  if (parsed.length > MAX_PAGES) {
    return friendlyDeletePagesError('too_many_pages');
  }
  const seen = new Set<number>();
  for (const entry of parsed) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 1) {
      return friendlyDeletePagesError('invalid_page_list');
    }
    if (entry > MAX_PAGES) {
      return friendlyDeletePagesError('out_of_range');
    }
    if (seen.has(entry)) {
      return friendlyDeletePagesError('duplicate_pages');
    }
    seen.add(entry);
  }
  return friendlyDeletePagesError('invalid_page_list');
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_DELETE_PAGES_BYTES : FREE_MAX_DELETE_PAGES_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyDeletePagesError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyDeletePagesError('no_file'), 400),
    };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(
        friendlyDeletePagesError('file_too_big', { mb: maxBytes / (1024 * 1024) }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfDeletePagesInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyDeletePagesError('filename_too_long', { filename })
        : friendlyDeletePagesError('invalid_pdf_meta', { filename });
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
      response: fieldError(friendlyDeletePagesError('bad_magic', { filename }), 400),
    };
  }

  const pagesRaw = form.get('pages');
  const pagesValue = typeof pagesRaw === 'string' ? pagesRaw : '';
  const parsedPages = PdfDeletePagesList.safeParse(pagesValue);
  if (!parsedPages.success) {
    return {
      ok: false,
      response: fieldError(mapPagesParseError(pagesValue), 400),
    };
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    pages: parsedPages.data,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await deletePdfPages({
      bytes: upload.bytes,
      pages: upload.pages,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForDeletePages(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.remainingPages),
      },
    });
  } catch (err) {
    if (err instanceof PdfDeletePagesError) {
      if (err.code === 'timeout') {
        return plainError(friendlyDeletePagesError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlyDeletePagesError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        const code = err.reason === 'password' ? 'invalid_pdf_password' : 'invalid_pdf_corrupt';
        return fieldError(friendlyDeletePagesError(code, { filename: upload.filename }), 400);
      }
      if (err.code === 'selection_failed') {
        const code = err.reason === 'duplicate' ? 'duplicate_pages' : 'out_of_range';
        return fieldError(friendlyDeletePagesError(code, { maxPages: MAX_PAGES }), 400);
      }
      return fieldError(friendlyDeletePagesError('delete_failed'), 422);
    }
    return plainError(friendlyDeletePagesError('unexpected'), 500);
  }
}
