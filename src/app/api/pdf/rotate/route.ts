import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForRotate } from '@/lib/business/pdf-format';
import { PdfRotateError, type PdfRotateRule, rotatePdfPages } from '@/lib/business/pdf-rotate';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_ROTATE_BYTES,
  PDF_MAGIC,
  type PdfRotateFieldErrors,
  PdfRotateInputMeta,
  PdfRotateRotationMap,
} from '@/lib/contracts/pdf-rotate';
import { friendlyRotateError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfRotateFieldErrors>({ errors: { file: message } }, { status });
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

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  rotations: PdfRotateRule[];
}
interface ReadErr {
  ok: false;
  response: Response;
}

function mapRotationParseError(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return friendlyRotateError('no_rotations');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return friendlyRotateError('invalid_rotation_map');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return friendlyRotateError('no_rotations');
  }
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      return friendlyRotateError('invalid_rotation_map');
    }
    const record = entry as { page?: unknown; deg?: unknown };
    const deg = record.deg;
    if (deg !== '90' && deg !== '180' && deg !== '270') {
      return friendlyRotateError('invalid_rotation_deg');
    }
    if (typeof record.page !== 'number' || !Number.isInteger(record.page)) {
      return friendlyRotateError('out_of_range_rotation');
    }
    if (record.page < 1 || record.page > MAX_PAGES) {
      return friendlyRotateError('out_of_range_rotation');
    }
  }
  const seen = new Set<number>();
  for (const entry of parsed) {
    const page = (entry as { page: number }).page;
    if (seen.has(page)) {
      return friendlyRotateError('duplicate_rotation');
    }
    seen.add(page);
  }
  return friendlyRotateError('invalid_rotation_map');
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyRotateError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyRotateError('no_file'), 400),
    };
  }

  if (entry.size > MAX_ROTATE_BYTES) {
    return {
      ok: false,
      response: fieldError(friendlyRotateError('file_too_big', { mb: 60 }), 413),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfRotateInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyRotateError('filename_too_long', { filename })
        : friendlyRotateError('invalid_pdf_meta', { filename });
    return {
      ok: false,
      response: fieldError(reason, 400),
    };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyRotateError('bad_magic', { filename }), 400),
    };
  }

  const rotationsRaw = form.get('rotations');
  const rotationsValue = typeof rotationsRaw === 'string' ? rotationsRaw : '';
  const parsedRotation = PdfRotateRotationMap.safeParse(rotationsValue);
  if (!parsedRotation.success) {
    return {
      ok: false,
      response: fieldError(mapRotationParseError(rotationsValue), 400),
    };
  }

  const rotations: PdfRotateRule[] = parsedRotation.data.map((rule) => ({
    page: rule.page,
    deg: Number.parseInt(rule.deg, 10) as 90 | 180 | 270,
  }));

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    rotations,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await rotatePdfPages({
      bytes: upload.bytes,
      rotations: upload.rotations,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForRotate(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfRotateError) {
      if (err.code === 'timeout') {
        return plainError(friendlyRotateError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlyRotateError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        const code = err.reason === 'password' ? 'invalid_pdf_password' : 'invalid_pdf_corrupt';
        return fieldError(friendlyRotateError(code, { filename: upload.filename }), 400);
      }
      if (err.code === 'selection_failed') {
        if (err.reason === 'duplicate') {
          return fieldError(
            friendlyRotateError('duplicate_rotation', { maxPages: MAX_PAGES }),
            400,
          );
        }
        return fieldError(
          friendlyRotateError('out_of_range_rotation', { maxPages: MAX_PAGES }),
          400,
        );
      }
      return fieldError(friendlyRotateError('rotate_failed'), 422);
    }
    return plainError(friendlyRotateError('unexpected'), 500);
  }
}
