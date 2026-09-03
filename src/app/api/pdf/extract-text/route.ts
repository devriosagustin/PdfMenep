import 'server-only';
import { NextResponse } from 'next/server';
import { extractTextFromPdf, PdfExtractTextError } from '@/lib/business/pdf-extract-text';
import { downloadNameForExtractText } from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  type PdfExtractTextFieldErrors,
  PdfExtractTextInputMeta,
  type PdfExtractTextServerError,
} from '@/lib/contracts/pdf-extract-text';
import { friendlyExtractTextError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfExtractTextFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfExtractTextServerError> {
  return NextResponse.json<PdfExtractTextServerError>({ error: message }, { status });
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
      response: fieldError(friendlyExtractTextError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyExtractTextError('no_file'), 400),
    };
  }

  if (entry.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: fieldError(
        friendlyExtractTextError('file_too_big', { mb: MAX_UPLOAD_BYTES / (1024 * 1024) }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfExtractTextInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyExtractTextError('filename_too_long', { filename })
        : friendlyExtractTextError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyExtractTextError('bad_magic', { filename }), 400),
    };
  }

  return { ok: true, filename: meta.data.filename, bytes };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await extractTextFromPdf(upload.bytes);
    const downloadName = downloadNameForExtractText(upload.filename);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(result.text);
    return new Response(encoded, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': String(encoded.byteLength),
        'content-disposition': `attachment; filename="${downloadName}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfExtractTextError) {
      if (err.code === 'timeout') {
        return plainError(friendlyExtractTextError('timeout'), 504);
      }
      if (err.code === 'encrypted_pdf') {
        return fieldError(friendlyExtractTextError('invalid_pdf_password'), 400);
      }
      if (err.code === 'empty_pdf') {
        return fieldError(friendlyExtractTextError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        return fieldError(
          friendlyExtractTextError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return plainError(friendlyExtractTextError('extract_failed'), 422);
    }
    return plainError(friendlyExtractTextError('unexpected'), 500);
  }
}
