import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForSign } from '@/lib/business/pdf-format';
import { PdfSignError, signPdf } from '@/lib/business/pdf-sign';
import {
  MAX_FILENAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_SIGN_BYTES,
  PDF_MAGIC,
  type PdfSignFieldErrors,
  PdfSignInputMeta,
  PdfSignPassword,
  type PdfSignServerError,
  PdfSignSigners,
} from '@/lib/contracts/pdf-sign';
import { friendlySignError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfSignFieldErrors>({ errors: { file: message } }, { status });
}

function fieldPasswordError(message: string, status: number): Response {
  return NextResponse.json<PdfSignFieldErrors>({ errors: { password: message } }, { status });
}

function fieldSignersError(message: string, status: number): Response {
  return NextResponse.json<PdfSignFieldErrors>({ errors: { signers: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfSignServerError> {
  return NextResponse.json<PdfSignServerError>({ error: message }, { status });
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
  signers: import('@/lib/contracts/pdf-sign').PdfSignSigner[];
  signingDateToday: string;
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
      response: fieldError(friendlySignError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlySignError('no_file'), 400),
    };
  }

  if (entry.size > MAX_SIGN_BYTES) {
    return {
      ok: false,
      response: fieldError(
        friendlySignError('file_too_big', {
          mb: MAX_SIGN_BYTES / (1024 * 1024),
          filename: entry instanceof File && entry.name ? entry.name : '',
        }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfSignInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlySignError('filename_too_long', { filename })
        : friendlySignError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlySignError('bad_magic', { filename }), 400),
    };
  }

  // Signers — required. JSON-stringified array validated via the same
  // PdfSignSigners schema the client island imports so size and shape
  // match on both sides of the wire. Per-signer length caps (name 80,
  // reason 200, location 200) are enforced inline below.
  const signersRaw = form.get('signers');
  if (typeof signersRaw !== 'string' || signersRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldSignersError(friendlySignError('invalid_signers'), 400),
    };
  }
  const signersParsed = PdfSignSigners.safeParse(signersRaw);
  if (!signersParsed.success) {
    // Disambiguate the failure shape: too-many rows vs unknown shape.
    // Both surface as 'invalid_signers'; 'too_many_signers' is the
    // dedicated code so a client can highlight the add-signer cap.
    let code: 'invalid_signers' | 'too_many_signers' = 'invalid_signers';
    try {
      const arr = JSON.parse(signersRaw);
      if (Array.isArray(arr) && arr.length > 5) code = 'too_many_signers';
    } catch {
      // keep 'invalid_signers'
    }
    return {
      ok: false,
      response: fieldSignersError(friendlySignError(code), 400),
    };
  }
  const signers = signersParsed.data as ReadonlyArray<
    import('@/lib/contracts/pdf-sign').PdfSignSigner
  >;

  // Per-row length cap (the schema caps `name` at MAX_SIGNER_NAME_LEN
  // and the optional strings at the schema's per-field cap, but we run
  // an extra spot check so a row that slipped past zod still gets a
  // field-keyed error rather than a 500).
  for (const s of signers) {
    if (s.name.length > 80) {
      return {
        ok: false,
        response: fieldSignersError(friendlySignError('signer_too_long'), 400),
      };
    }
    if ((s.reason?.length ?? 0) > 200) {
      return {
        ok: false,
        response: fieldSignersError(friendlySignError('reason_too_long'), 400),
      };
    }
    if ((s.location?.length ?? 0) > 200) {
      return {
        ok: false,
        response: fieldSignersError(friendlySignError('location_too_long'), 400),
      };
    }
  }

  // Password — optional. Absent or empty strings are treated as "no
  // password supplied". Length bound mirrors /pdf/repair.
  const passwordRaw = form.get('password');
  let password: string | undefined;
  if (typeof passwordRaw === 'string' && passwordRaw.length > 0) {
    if (passwordRaw.length > MAX_PASSWORD_LEN) {
      return {
        ok: false,
        response: fieldPasswordError(
          friendlySignError('password_too_long', { maxChars: MAX_PASSWORD_LEN }),
          400,
        ),
      };
    }
    // Run zod for symmetry with the client (current cap is the lower of
    // schema + the explicit length bound above — same outcome).
    const passwordParsed = PdfSignPassword.safeParse(passwordRaw);
    if (!passwordParsed.success) {
      return {
        ok: false,
        response: fieldPasswordError(
          friendlySignError('password_too_long', { maxChars: MAX_PASSWORD_LEN }),
          400,
        ),
      };
    }
    password = passwordRaw;
  }

  // signingDateToday — optional ISO YYYY-MM-DD fallback for the missing-
  // date stamp path. Default to "today" in UTC if absent so the stamp is
  // never blank.
  const dateRaw = form.get('signingDateToday');
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const signingDateToday =
    typeof dateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? dateRaw
      : `${yyyy}-${mm}-${dd}`;

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    password,
    signers: signers as import('@/lib/contracts/pdf-sign').PdfSignSigner[],
    signingDateToday,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await signPdf({
      bytes: upload.bytes,
      signers: upload.signers,
      password: upload.password,
      signingDateToday: upload.signingDateToday,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForSign(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfSignError) {
      if (err.code === 'timeout') {
        return plainError(friendlySignError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlySignError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'bad_signers') {
        return fieldSignersError(friendlySignError('invalid_signers'), 400);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(friendlySignError('invalid_pdf_password'), 400);
        }
        return fieldError(
          friendlySignError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return plainError(friendlySignError('sign_failed'), 422);
    }
    return plainError(friendlySignError('unexpected'), 500);
  }
}
