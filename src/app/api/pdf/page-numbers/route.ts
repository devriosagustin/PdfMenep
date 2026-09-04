import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForPageNumbers } from '@/lib/business/pdf-format';
import { PdfPageNumbersError, stampPageNumbers } from '@/lib/business/pdf-page-numbers';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_PAGE_NUMBERS_BYTES,
  MAX_FILENAME_LEN,
  MAX_PAGE_NUMBERS_BYTES,
  PDF_MAGIC,
  type PdfNumberPosition,
  PdfNumberPosition as PdfNumberPositionZ,
  type PdfPageNumbersFieldErrors,
  PdfPageNumbersInputMeta,
} from '@/lib/contracts/pdf-page-numbers';
import { friendlyPageNumbersError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  position: PdfNumberPosition;
  startingNumber: number;
}
interface ReadErr {
  ok: false;
  response: Response;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfPageNumbersFieldErrors>({ errors: { file: message } }, { status });
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

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_PAGE_NUMBERS_BYTES : FREE_MAX_PAGE_NUMBERS_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('no_file'), 400),
    };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(
        friendlyPageNumbersError('file_too_big', { mb: maxBytes / (1024 * 1024) }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfPageNumbersInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyPageNumbersError('filename_too_long', { filename })
        : friendlyPageNumbersError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('bad_magic', { filename }), 400),
    };
  }

  const positionRaw = form.get('position');
  if (typeof positionRaw !== 'string' || positionRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('no_position'), 400),
    };
  }
  const parsedPosition = PdfNumberPositionZ.safeParse(positionRaw.trim());
  if (!parsedPosition.success) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('invalid_position'), 400),
    };
  }

  const startingRaw = form.get('startingNumber');
  if (typeof startingRaw !== 'string' || startingRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('no_starting_number'), 400),
    };
  }
  const trimmedStarting = startingRaw.trim();
  if (!/^\d+$/.test(trimmedStarting)) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('invalid_starting_number'), 400),
    };
  }
  const parsedStarting = Number.parseInt(trimmedStarting, 10);
  if (!Number.isFinite(parsedStarting) || parsedStarting < 1) {
    return {
      ok: false,
      response: fieldError(friendlyPageNumbersError('invalid_starting_number'), 400),
    };
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    position: parsedPosition.data,
    startingNumber: parsedStarting,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await stampPageNumbers({
      bytes: upload.bytes,
      position: upload.position,
      startingNumber: upload.startingNumber,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForPageNumbers(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfPageNumbersError) {
      if (err.code === 'timeout') {
        return plainError(friendlyPageNumbersError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlyPageNumbersError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(friendlyPageNumbersError('invalid_pdf_password'), 400);
        }
        return fieldError(
          friendlyPageNumbersError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return fieldError(friendlyPageNumbersError('page_numbers_failed'), 422);
    }
    return plainError(friendlyPageNumbersError('unexpected'), 500);
  }
}
