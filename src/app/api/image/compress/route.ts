import 'server-only';
import JSZip from 'jszip';
import { NextResponse } from 'next/server';

import { compressImage, extensionFor, ImageCompressError } from '@/lib/business/image-compress';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  type CompressFileMeta,
  DEFAULT_QUALITY,
  detectCompressibleMagic,
  FREE_MAX_COMPRESS_BYTES,
  FREE_MAX_COMPRESS_FILES,
  MAX_COMPRESS_BYTES,
  MAX_COMPRESS_FILES,
  MAX_FILENAME_LEN,
  QualityParam,
} from '@/lib/contracts/image-compress';
import { friendlyCompressError } from '@/lib/errors/friendly';
import { recordToolEvent } from '@/lib/usage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface FileOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
}
interface FileErr {
  ok: false;
  message: string;
}

function plainError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

async function readSingleFile(
  entry: FormDataEntryValue,
  maxBytes: number,
): Promise<FileOk | FileErr> {
  if (!(entry instanceof Blob) || entry.size === 0) {
    return { ok: false, message: friendlyCompressError('read_file_failed') };
  }
  if (entry.size > maxBytes) {
    return {
      ok: false,
      message: friendlyCompressError('file_too_big', {
        mb: maxBytes / (1024 * 1024),
      }),
    };
  }
  const rawName = entry instanceof File && entry.name ? entry.name : 'imagen';
  if (rawName.length > MAX_FILENAME_LEN) {
    return { ok: false, message: friendlyCompressError('filename_too_long') };
  }
  const buf = await entry.arrayBuffer();
  return { ok: true, filename: rawName, bytes: new Uint8Array(buf) };
}

function stripExt(name: string): string {
  const trimmed = name.replace(/\.(jpe?g|png|webp)$/i, '').trim() || 'imagen';
  return trimmed.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'imagen';
}

function pctSaved(original: number, compressed: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - compressed) / original) * 1000) / 10;
}

export async function POST(req: Request): Promise<Response> {
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_COMPRESS_BYTES : FREE_MAX_COMPRESS_BYTES;
  const maxFiles = plan === 'PRO' ? MAX_COMPRESS_FILES : FREE_MAX_COMPRESS_FILES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return plainError(friendlyCompressError('read_form_failed'), 400);
  }

  const entries = form.getAll('files');
  if (entries.length === 0) {
    return plainError(friendlyCompressError('no_files'), 400);
  }
  if (entries.length > maxFiles) {
    return plainError(friendlyCompressError('too_many_files', { maxFiles }), 400);
  }

  const qualityRaw = form.get('quality');
  let quality = DEFAULT_QUALITY;
  if (typeof qualityRaw === 'string' && qualityRaw.length > 0) {
    const parsed = Number.parseInt(qualityRaw, 10);
    const safe = QualityParam.safeParse(parsed);
    if (!safe.success) {
      return plainError(friendlyCompressError('invalid_quality'), 400);
    }
    quality = safe.data;
  }

  const uploads: { filename: string; bytes: Uint8Array }[] = [];
  for (const entry of entries) {
    const rawName = entry instanceof File && entry.name ? entry.name : 'archivo';
    const read = await readSingleFile(entry, maxBytes);
    if (!read.ok) {
      return plainError(read.message, 400);
    }
    if (!detectCompressibleMagic(read.bytes)) {
      return plainError(friendlyCompressError('bad_magic', { filename: rawName }), 400);
    }
    uploads.push({ filename: read.filename, bytes: read.bytes });
  }

  const zip = new JSZip();
  const fileMetas: CompressFileMeta[] = [];
  let totalIn = 0;
  let totalOut = 0;
  const usedNames = new Map<string, number>();
  const startedAt = performance.now();

  for (const upload of uploads) {
    try {
      const result = await compressImage(upload.bytes, quality);
      const baseName = stripExt(upload.filename);
      const ext = extensionFor(result.source);
      let entryName = `${baseName}.${ext}`;
      const collisions = usedNames.get(entryName) ?? 0;
      if (collisions > 0) {
        entryName = `${baseName}-${collisions + 1}.${ext}`;
      }
      usedNames.set(`${baseName}.${ext}`, collisions + 1);

      zip.file(entryName, new Uint8Array(result.bytes));
      const savings = pctSaved(upload.bytes.byteLength, result.bytes.byteLength);
      totalIn += upload.bytes.byteLength;
      totalOut += result.bytes.byteLength;
      fileMetas.push({
        filename: entryName,
        originalSize: upload.bytes.byteLength,
        compressedSize: result.bytes.byteLength,
        savingsPct: savings,
      });
    } catch (err) {
      let code = 'unexpected';
      let message: string;
      let status = 500;
      if (err instanceof ImageCompressError) {
        if (err.code === 'timeout') {
          code = 'timeout';
          message = friendlyCompressError('timeout');
          status = 504;
        } else if (err.code === 'not_compressible') {
          code = 'not_compressible';
          message = friendlyCompressError('not_compressible', { filename: upload.filename });
          status = 400;
        } else if (err.code === 'decode_failed') {
          code = 'decode_failed';
          message = friendlyCompressError('decode_failed', { filename: upload.filename });
          status = 400;
        } else {
          message = friendlyCompressError('unexpected');
        }
      } else {
        message = friendlyCompressError('unexpected');
      }
      await recordToolEvent({
        tool: 'image-compress',
        result: 'FAILURE',
        errorCode: code,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return plainError(message, status);
    }
  }

  const totals = {
    generatedAt: new Date().toISOString(),
    quality,
    totalIn,
    totalOut,
    savingsPct: pctSaved(totalIn, totalOut),
    files: fileMetas,
  };
  zip.file('manifest.json', JSON.stringify(totals, null, 2));

  const zipBuf = await zip.generateAsync({ type: 'uint8array' });
  const ts = Date.now();
  const headers: Record<string, string> = {
    'content-type': 'application/zip',
    'content-length': String(zipBuf.byteLength),
    'content-disposition': `attachment; filename="imagenes-comprimidas-${ts}.zip"`,
    'cache-control': 'no-store',
    'x-summary-count': String(fileMetas.length),
    'x-summary-total-in': String(totalIn),
    'x-summary-total-out': String(totalOut),
    'x-summary-savings-pct': String(totals.savingsPct),
  };
  await recordToolEvent({
    tool: 'image-compress',
    result: 'SUCCESS',
    inputBytes: totalIn,
    outputBytes: totalOut,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return new Response(new Uint8Array(zipBuf), { status: 200, headers });
}
