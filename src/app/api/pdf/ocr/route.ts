import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForOcr } from '@/lib/business/pdf-format';
import { PdfOcrError, runOcrOnPdf } from '@/lib/business/pdf-ocr';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_OCR_BYTES,
  MAX_FILENAME_LEN,
  MAX_OCR_BYTES,
  MAX_OCR_PAGES,
  type PdfOcrFieldErrors,
  PdfOcrInputMeta,
  PdfOcrLanguage,
  type PdfOcrServerError,
} from '@/lib/contracts/pdf-ocr';
import { friendlyOcrError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfOcrFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json<PdfOcrServerError>({ error: message }, { status });
}

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < '%PDF-'.length) return false;
  for (let i = 0; i < '%PDF-'.length; i++) {
    if (bytes[i] !== '%PDF-'.charCodeAt(i)) return false;
  }
  return true;
}

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  language: 'es' | 'en';
  pageSelection: number[] | null;
}
interface ReadErr {
  ok: false;
  response: Response;
}

function parsePagesList(raw: string, maxPages: number): number[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const token of trimmed.split(',')) {
    const part = token.trim();
    if (part.length === 0) return []; // malformed → empty array rejected upstream
    if (!/^\d+$/.test(part)) return [];
    const n = Number.parseInt(part, 10);
    if (!Number.isInteger(n) || n < 1 || n > maxPages) return [];
    if (seen.has(n)) return [];
    seen.add(n);
    result.push(n);
  }
  return result;
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_OCR_BYTES : FREE_MAX_OCR_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, response: fieldError(friendlyOcrError('read_form_failed'), 400) };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return { ok: false, response: fieldError(friendlyOcrError('no_file'), 400) };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(friendlyOcrError('file_too_big', { mb: maxBytes / (1024 * 1024) }), 413),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfOcrInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyOcrError('filename_too_long', { filename })
        : friendlyOcrError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return { ok: false, response: fieldError(friendlyOcrError('bad_magic', { filename }), 400) };
  }

  // Language — accept 'es' or 'en' only (matches PdfOcrLanguage zod enum).
  const langRaw = form.get('language');
  const langValue = typeof langRaw === 'string' ? langRaw.trim() : '';
  if (langValue.length === 0) {
    return { ok: false, response: fieldError(friendlyOcrError('no_language'), 400) };
  }
  const parsedLang = PdfOcrLanguage.safeParse(langValue);
  if (!parsedLang.success) {
    return { ok: false, response: fieldError(friendlyOcrError('invalid_language'), 400) };
  }

  // Optional per-page selection. An absent `pages` field is the "all
  // pages" intent; `pages=` (empty) is a no-op (treated as 'all') so the
  // client island's pristine empty string never rejects on its way out.
  let pageSelection: number[] | null = null;
  const pagesRaw = form.get('pages');
  const pagesPresent = typeof pagesRaw === 'string' && pagesRaw.length > 0;
  if (pagesPresent) {
    const parsed = parsePagesList(pagesRaw as string, MAX_OCR_PAGES);
    if (parsed.length === 0) {
      return { ok: false, response: fieldError(friendlyOcrError('invalid_pages'), 400) };
    }
    if (parsed.length > MAX_OCR_PAGES) {
      return {
        ok: false,
        response: fieldError(
          friendlyOcrError('too_many_pages_selected', { maxPages: MAX_OCR_PAGES }),
          400,
        ),
      };
    }
    pageSelection = parsed;
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    language: parsedLang.data,
    pageSelection,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await runOcrOnPdf({
      filename: upload.filename,
      bytes: upload.bytes,
      language: upload.language,
      pageSelection: upload.pageSelection,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForOcr(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfOcrError) {
      if (err.code === 'timeout') {
        return plainError(friendlyOcrError('timeout'), 504);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(friendlyOcrError('invalid_pdf_password'), 400);
        }
        if (err.reason === 'empty') {
          return fieldError(friendlyOcrError('invalid_pdf_empty'), 400);
        }
        return fieldError(
          friendlyOcrError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      if (err.code === 'page_limit') {
        return fieldError(friendlyOcrError('over_page_limit', { maxPages: MAX_OCR_PAGES }), 400);
      }
      if (err.code === 'selection_failed') {
        const code =
          err.reason === 'duplicate'
            ? 'invalid_pages'
            : err.reason === 'out_of_range'
              ? 'out_of_range_pages'
              : 'invalid_pages';
        return fieldError(friendlyOcrError(code, { maxPages: MAX_OCR_PAGES }), 400);
      }
      return fieldError(friendlyOcrError('ocr_failed'), 422);
    }
    return plainError(friendlyOcrError('unexpected'), 500);
  }
}
