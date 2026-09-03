import 'server-only';
import { NextResponse } from 'next/server';
import { downloadNameForDocxToPdf } from '@/lib/business/pdf-format';
import { convertDocxToPdf, DocxToPdfError } from '@/lib/business/word-a-pdf';
import {
  type DocxToPdfFieldErrors,
  DocxToPdfInputMeta,
  type DocxToPdfServerError,
  isDocxMagic,
  MAX_FILENAME_LEN,
  MAX_UPLOAD_BYTES,
} from '@/lib/contracts/word-a-pdf';
import { friendlyDocxToPdfError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): NextResponse<DocxToPdfFieldErrors> {
  return NextResponse.json<DocxToPdfFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<DocxToPdfServerError> {
  return NextResponse.json<DocxToPdfServerError>({ error: message }, { status });
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
      response: fieldError(friendlyDocxToPdfError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyDocxToPdfError('no_file'), 400),
    };
  }

  if (entry.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: fieldError(
        friendlyDocxToPdfError('file_too_big', {
          mb: MAX_UPLOAD_BYTES / (1024 * 1024),
        }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.docx';
  const meta = DocxToPdfInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyDocxToPdfError('filename_too_long', { filename })
        : friendlyDocxToPdfError('invalid_docx_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isDocxMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyDocxToPdfError('bad_magic', { filename }), 400),
    };
  }

  return { ok: true, filename: meta.data.filename, bytes };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await convertDocxToPdf(upload.bytes);
    const downloadName = downloadNameForDocxToPdf(upload.filename);
    return new Response(result.pdf, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadName}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof DocxToPdfError) {
      switch (err.code) {
        case 'timeout':
          return plainError(friendlyDocxToPdfError('timeout'), 504);
        case 'docx_protected':
          return fieldError(friendlyDocxToPdfError('docx_protected'), 400);
        case 'docx_no_document':
        case 'docx_parse_failed':
          return fieldError(friendlyDocxToPdfError('docx_parse_failed'), 400);
        case 'convert_failed':
          return fieldError(friendlyDocxToPdfError('convert_failed'), 422);
      }
    }
    return plainError(friendlyDocxToPdfError('unexpected'), 500);
  }
}
