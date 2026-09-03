import 'server-only';
import { NextResponse } from 'next/server';
import { convertPdfToDocx, PdfToWordError } from '@/lib/business/pdf-a-word';
import { downloadNameForPdfToWord } from '@/lib/business/pdf-format';
import {
  MAX_FILENAME_LEN,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  type PdfToWordFieldErrors,
  PdfToWordInputMeta,
  type PdfToWordServerError,
} from '@/lib/contracts/pdf-a-word';
import { friendlyPdfToWordError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): NextResponse<PdfToWordFieldErrors> {
  return NextResponse.json<PdfToWordFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfToWordServerError> {
  return NextResponse.json<PdfToWordServerError>({ error: message }, { status });
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
      response: fieldError(friendlyPdfToWordError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyPdfToWordError('no_file'), 400),
    };
  }

  if (entry.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: fieldError(
        friendlyPdfToWordError('file_too_big', {
          mb: MAX_UPLOAD_BYTES / (1024 * 1024),
        }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfToWordInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyPdfToWordError('filename_too_long', { filename })
        : friendlyPdfToWordError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyPdfToWordError('bad_magic', { filename }), 400),
    };
  }

  return { ok: true, filename: meta.data.filename, bytes };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await convertPdfToDocx(upload.bytes);
    const downloadName = downloadNameForPdfToWord(upload.filename);
    return new Response(result.docx, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-length': String(result.docx.byteLength),
        'content-disposition': `attachment; filename="${downloadName}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfToWordError) {
      switch (err.code) {
        case 'timeout':
          return plainError(friendlyPdfToWordError('timeout'), 504);
        case 'encrypted_pdf':
          return fieldError(friendlyPdfToWordError('invalid_pdf_password'), 400);
        case 'empty_pdf':
        case 'too_many_pages':
          return fieldError(friendlyPdfToWordError('invalid_pdf_empty'), 400);
        case 'invalid_pdf':
          return fieldError(
            friendlyPdfToWordError('invalid_pdf_corrupt', {
              filename: upload.filename,
            }),
            400,
          );
        case 'convert_failed':
          return fieldError(friendlyPdfToWordError('convert_failed'), 422);
      }
    }
    return plainError(friendlyPdfToWordError('unexpected'), 500);
  }
}
