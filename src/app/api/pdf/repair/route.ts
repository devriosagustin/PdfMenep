import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForRepair } from '@/lib/business/pdf-format';
import { PdfRepairError, repairPdf } from '@/lib/business/pdf-repair';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_REPAIR_BYTES,
  MAX_FILENAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_REPAIR_BYTES,
  PDF_MAGIC,
  type PdfRepairFieldErrors,
  PdfRepairInputMeta,
  type PdfRepairServerError,
} from '@/lib/contracts/pdf-repair';
import { friendlyRepairError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfRepairFieldErrors>({ errors: { file: message } }, { status });
}

function fieldPasswordError(message: string, status: number): Response {
  return NextResponse.json<PdfRepairFieldErrors>({ errors: { password: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfRepairServerError> {
  return NextResponse.json<PdfRepairServerError>({ error: message }, { status });
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
  password: string | undefined;
}
interface ReadErr {
  ok: false;
  response: Response;
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_REPAIR_BYTES : FREE_MAX_REPAIR_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyRepairError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyRepairError('no_file'), 400),
    };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(
        friendlyRepairError('file_too_big', {
          mb: maxBytes / (1024 * 1024),
          filename: entry instanceof File && entry.name ? entry.name : '',
        }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfRepairInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyRepairError('filename_too_long', { filename })
        : friendlyRepairError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyRepairError('bad_magic', { filename }), 400),
    };
  }

  // Password — optional. Absent or empty strings are treated as "no
  // password supplied". Length bounds are capped at MAX_PASSWORD_LEN
  // (mirrors pdf-protect / pdf-unlock); a value over the cap returns a
  // field error keyed to "password" so the client can highlight the
  // password input — but we do NOT compare to a wrong-password error.
  const passwordRaw = form.get('password');
  let password: string | undefined;
  if (typeof passwordRaw === 'string' && passwordRaw.length > 0) {
    if (passwordRaw.length > MAX_PASSWORD_LEN) {
      return {
        ok: false,
        response: fieldPasswordError(
          friendlyRepairError('password_too_long', { maxChars: MAX_PASSWORD_LEN }),
          400,
        ),
      };
    }
    password = passwordRaw;
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    password,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await repairPdf({ bytes: upload.bytes, password: upload.password });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForRepair(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfRepairError) {
      if (err.code === 'timeout') {
        return plainError(friendlyRepairError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlyRepairError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(friendlyRepairError('invalid_pdf_password'), 400);
        }
        return fieldError(
          friendlyRepairError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return plainError(friendlyRepairError('repair_failed'), 422);
    }
    return plainError(friendlyRepairError('unexpected'), 500);
  }
}
