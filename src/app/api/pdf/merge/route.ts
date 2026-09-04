import 'server-only';
import { NextResponse } from 'next/server';
import { downloadNameForMerge } from '@/lib/business/pdf-format';
import { mergePdfsToPdf, PdfMergeError, type PdfMergeInput } from '@/lib/business/pdf-merge';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_PDFS,
  FREE_MAX_PER_FILE_BYTES,
  FREE_MAX_TOTAL_BYTES,
  MAX_FILENAME_LEN,
  MAX_PDFS,
  MAX_PER_FILE_BYTES,
  MAX_TOTAL_BYTES,
  PDF_MAGIC,
  type PdfMergeFieldErrors,
  PdfMergeInputMeta,
} from '@/lib/contracts/pdf-merge';
import { friendlyError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReadOk {
  ok: true;
  inputs: PdfMergeInput[];
}
interface ReadErr {
  ok: false;
  response: Response;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfMergeFieldErrors>({ errors: { files: message } }, { status });
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

async function readUploads(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxPdfs = plan === 'PRO' ? MAX_PDFS : FREE_MAX_PDFS;
  const maxPerFileBytes = plan === 'PRO' ? MAX_PER_FILE_BYTES : FREE_MAX_PER_FILE_BYTES;
  const maxTotalBytes = plan === 'PRO' ? MAX_TOTAL_BYTES : FREE_MAX_TOTAL_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyError('read_form_failed'), 400),
    };
  }

  const entries = form.getAll('files').filter((e): e is File => e instanceof File && e.size > 0);
  if (entries.length < 2) {
    return {
      ok: false,
      response: fieldError(friendlyError('too_few_files'), 400),
    };
  }
  if (entries.length > maxPdfs) {
    return {
      ok: false,
      response: fieldError(friendlyError('too_many_files', undefined, { maxPdfs }), 400),
    };
  }

  const inputs: PdfMergeInput[] = [];
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const filename = entry instanceof File && entry.name ? entry.name : `archivo-${i + 1}.pdf`;
    if (filename.length > MAX_FILENAME_LEN) {
      return {
        ok: false,
        response: fieldError(friendlyError('filename_too_long', filename), 400),
      };
    }
    if (entry.size > maxPerFileBytes) {
      return {
        ok: false,
        response: fieldError(
          friendlyError('file_too_big', filename, {
            maxPerFileMb: maxPerFileBytes / (1024 * 1024),
          }),
          413,
        ),
      };
    }
    const meta = PdfMergeInputMeta.safeParse({ filename, sizeBytes: entry.size });
    if (!meta.success) {
      return {
        ok: false,
        response: fieldError(friendlyError('invalid_pdf_meta', filename), 400),
      };
    }
    total += entry.size;
    if (total > maxTotalBytes) {
      return {
        ok: false,
        response: fieldError(
          friendlyError('total_too_big', undefined, {
            maxTotalMb: maxTotalBytes / (1024 * 1024),
          }),
          413,
        ),
      };
    }
    const buffer = await entry.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!isPdfMagic(bytes)) {
      return {
        ok: false,
        response: fieldError(friendlyError('bad_magic', filename), 400),
      };
    }
    inputs.push({ filename: meta.data.filename, bytes });
  }

  return { ok: true, inputs };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUploads(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await mergePdfsToPdf(upload.inputs);
    const first = upload.inputs[0];
    const filename = downloadNameForMerge(first ? first.filename : null);
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfMergeError) {
      if (err.code === 'timeout') return plainError(friendlyError('timeout'), 504);
      if (err.code === 'invalid_pdf') {
        return fieldError(
          err.isPassword ? err.message : friendlyError('invalid_pdf', err.filename),
          400,
        );
      }
      return fieldError(friendlyError('merge_failed', err.filename), 422);
    }
    return plainError(friendlyError('unexpected'), 500);
  }
}
