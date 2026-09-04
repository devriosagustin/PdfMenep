import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForProtect } from '@/lib/business/pdf-format';
import { PdfProtectError, protectPdf } from '@/lib/business/pdf-protect';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_PROTECT_BYTES,
  MAX_FILENAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_PROTECT_BYTES,
  MIN_PASSWORD_LEN,
  PDF_MAGIC,
  type PdfProtectFieldErrors,
  PdfProtectInputMeta,
  PdfProtectPassword,
  type PdfProtectServerError,
} from '@/lib/contracts/pdf-protect';
import { friendlyProtectError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfProtectFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfProtectServerError> {
  return NextResponse.json<PdfProtectServerError>({ error: message }, { status });
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
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_PROTECT_BYTES : FREE_MAX_PROTECT_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyProtectError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyProtectError('no_file'), 400),
    };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(
        friendlyProtectError('file_too_big', { mb: maxBytes / (1024 * 1024) }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfProtectInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyProtectError('filename_too_long', { filename })
        : friendlyProtectError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyProtectError('bad_magic', { filename }), 400),
    };
  }

  // Password — the wire is FormData `password` (caller is the client
  // island). We accept it as raw string then run zod so the same length
  // bounds (4..64) apply on both sides.
  const passwordRaw = form.get('password');
  if (typeof passwordRaw !== 'string' || passwordRaw.length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyProtectError('no_password'), 400),
    };
  }
  const passwordParsed = PdfProtectPassword.safeParse(passwordRaw);
  if (!passwordParsed.success) {
    const reason =
      passwordRaw.length < MIN_PASSWORD_LEN
        ? friendlyProtectError('password_too_short', { minChars: MIN_PASSWORD_LEN })
        : friendlyProtectError('password_too_long', { maxChars: MAX_PASSWORD_LEN });
    return { ok: false, response: fieldError(reason, 400) };
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
    const result = await protectPdf({ bytes: upload.bytes, password: upload.password });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForProtect(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfProtectError) {
      if (err.code === 'timeout') {
        return plainError(friendlyProtectError('timeout'), 504);
      }
      if (err.code === 'invalid_pdf') {
        const code =
          err.reason === 'password'
            ? 'invalid_pdf_password'
            : err.reason === 'empty'
              ? 'invalid_pdf_empty'
              : 'invalid_pdf_corrupt';
        return fieldError(friendlyProtectError(code, { filename: upload.filename }), 400);
      }
      return plainError(friendlyProtectError('protect_failed'), 422);
    }
    return plainError(friendlyProtectError('unexpected'), 500);
  }
}
