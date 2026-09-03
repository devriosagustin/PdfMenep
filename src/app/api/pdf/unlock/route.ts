import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForUnlock } from '@/lib/business/pdf-format';
import { PdfUnlockError, unlockPdf } from '@/lib/business/pdf-unlock';
import {
  MAX_FILENAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_UNLOCK_BYTES,
  PDF_MAGIC,
  type PdfUnlockFieldErrors,
  PdfUnlockInputMeta,
  PdfUnlockPassword,
  type PdfUnlockServerError,
} from '@/lib/contracts/pdf-unlock';
import { friendlyUnlockError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfUnlockFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfUnlockServerError> {
  return NextResponse.json<PdfUnlockServerError>({ error: message }, { status });
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
  password: string;
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
      response: fieldError(friendlyUnlockError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyUnlockError('no_file'), 400),
    };
  }

  if (entry.size > MAX_UNLOCK_BYTES) {
    return {
      ok: false,
      response: fieldError(
        friendlyUnlockError('file_too_big', { mb: MAX_UNLOCK_BYTES / (1024 * 1024) }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfUnlockInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyUnlockError('filename_too_long', { filename })
        : friendlyUnlockError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyUnlockError('bad_magic', { filename }), 400),
    };
  }

  // Password — accept ANY non-empty value (≤ MAX_PASSWORD_LEN). We never
  // reject at parse time for "too short" — the route layer maps pdf-lib's
  // "/password/i" error to invalid_pdf_password so we don't leak whether
  // the source file is encrypted.
  const passwordRaw = form.get('password');
  if (typeof passwordRaw !== 'string' || passwordRaw.length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyUnlockError('no_password'), 400),
    };
  }
  const passwordParsed = PdfUnlockPassword.safeParse(passwordRaw);
  if (!passwordParsed.success) {
    return {
      ok: false,
      response: fieldError(
        friendlyUnlockError('password_too_long', { maxChars: MAX_PASSWORD_LEN }),
        400,
      ),
    };
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    password: passwordParsed.data,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await unlockPdf({ bytes: upload.bytes, password: upload.password });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForUnlock(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfUnlockError) {
      if (err.code === 'timeout') {
        return plainError(friendlyUnlockError('timeout'), 504);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(
            friendlyUnlockError('unlock_wrong_password', { filename: upload.filename }),
            400,
          );
        }
        if (err.reason === 'empty') {
          return fieldError(friendlyUnlockError('invalid_pdf_empty'), 400);
        }
        return fieldError(
          friendlyUnlockError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return plainError(friendlyUnlockError('unlock_failed'), 422);
    }
    return plainError(friendlyUnlockError('unexpected'), 500);
  }
}
