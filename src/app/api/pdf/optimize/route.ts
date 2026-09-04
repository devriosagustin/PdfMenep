import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForOptimize } from '@/lib/business/pdf-format';
import { optimizePdf, PdfOptimizeError } from '@/lib/business/pdf-optimize';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_OPTIMIZE_BYTES,
  MAX_FILENAME_LEN,
  MAX_OPTIMIZE_BYTES,
  PDF_MAGIC,
  type PdfOptimizeFieldErrors,
  PdfOptimizeInputMeta,
  type PdfOptimizeLevel,
  PdfOptimizeLevel as PdfOptimizeLevelZ,
} from '@/lib/contracts/pdf-optimize';
import { friendlyOptimizeError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  level: PdfOptimizeLevel;
}
interface ReadErr {
  ok: false;
  response: Response;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfOptimizeFieldErrors>({ errors: { file: message } }, { status });
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
  const maxBytes = plan === 'PRO' ? MAX_OPTIMIZE_BYTES : FREE_MAX_OPTIMIZE_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, response: fieldError(friendlyOptimizeError('read_form_failed'), 400) };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return { ok: false, response: fieldError(friendlyOptimizeError('no_file'), 400) };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(
        friendlyOptimizeError('file_too_big', { mb: maxBytes / (1024 * 1024) }),
        413,
      ),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfOptimizeInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyOptimizeError('filename_too_long', { filename })
        : friendlyOptimizeError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyOptimizeError('bad_magic', { filename }), 400),
    };
  }

  const levelRaw = form.get('level');
  if (typeof levelRaw !== 'string' || levelRaw.trim().length === 0) {
    return { ok: false, response: fieldError(friendlyOptimizeError('no_level'), 400) };
  }
  const parsedLevel = PdfOptimizeLevelZ.safeParse(levelRaw.trim());
  if (!parsedLevel.success) {
    return { ok: false, response: fieldError(friendlyOptimizeError('invalid_level'), 400) };
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    level: parsedLevel.data,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await optimizePdf(
      { filename: upload.filename, bytes: upload.bytes },
      upload.level,
    );
    const downloadName = downloadNameForOptimize(upload.filename);
    return new Response(new Uint8Array(result.pdf), {
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
    if (err instanceof PdfOptimizeError) {
      if (err.code === 'timeout') {
        return plainError(friendlyOptimizeError('timeout'), 504);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(friendlyOptimizeError('invalid_pdf_password'), 400);
        }
        if (err.reason === 'empty') {
          return fieldError(friendlyOptimizeError('invalid_pdf_empty'), 400);
        }
        return fieldError(
          friendlyOptimizeError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return plainError(friendlyOptimizeError('optimize_failed'), 422);
    }
    return plainError(friendlyOptimizeError('unexpected'), 500);
  }
}
