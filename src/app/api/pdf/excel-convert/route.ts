import 'server-only';
import { NextResponse } from 'next/server';
import { convertPdfToXlsx, PdfToExcelError } from '@/lib/business/pdf-a-excel';
import { downloadNameForPdfToExcel } from '@/lib/business/pdf-format';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_UPLOAD_BYTES,
  MAX_FILENAME_LEN,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  type PdfToExcelFieldErrors,
  PdfToExcelInputMeta,
  type PdfToExcelServerError,
} from '@/lib/contracts/pdf-a-excel';
import { friendlyPdfToExcelError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): NextResponse<PdfToExcelFieldErrors> {
  return NextResponse.json<PdfToExcelFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): NextResponse<PdfToExcelServerError> {
  return NextResponse.json<PdfToExcelServerError>({ error: message }, { status });
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
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_UPLOAD_BYTES : FREE_MAX_UPLOAD_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyPdfToExcelError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyPdfToExcelError('no_file'), 400),
    };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(
        friendlyPdfToExcelError('file_too_big', {
          mb: maxBytes / (1024 * 1024),
        }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfToExcelInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyPdfToExcelError('filename_too_long', { filename })
        : friendlyPdfToExcelError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyPdfToExcelError('bad_magic', { filename }), 400),
    };
  }

  return { ok: true, filename: meta.data.filename, bytes };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await convertPdfToXlsx(upload.bytes);
    const downloadName = downloadNameForPdfToExcel(upload.filename);
    return new Response(result.xlsx, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': String(result.xlsx.byteLength),
        'content-disposition': `attachment; filename="${downloadName}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
        'x-rows': String(result.rowCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfToExcelError) {
      switch (err.code) {
        case 'timeout':
          return plainError(friendlyPdfToExcelError('timeout'), 504);
        case 'encrypted_pdf':
          return fieldError(friendlyPdfToExcelError('invalid_pdf_password'), 400);
        case 'empty_pdf':
        case 'too_many_pages':
          return fieldError(friendlyPdfToExcelError('invalid_pdf_empty'), 400);
        case 'invalid_pdf':
          return fieldError(
            friendlyPdfToExcelError('invalid_pdf_corrupt', {
              filename: upload.filename,
            }),
            400,
          );
        case 'convert_failed':
          return fieldError(friendlyPdfToExcelError('convert_failed'), 422);
      }
    }
    return plainError(friendlyPdfToExcelError('unexpected'), 500);
  }
}
