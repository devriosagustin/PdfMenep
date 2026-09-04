import 'server-only';
import { NextResponse } from 'next/server';
import { downloadNameForJpg } from '@/lib/business/jpg-format';
import {
  assembleJpegsToPdf,
  JpgAssemblyError,
  type JpgAssemblyInput,
} from '@/lib/business/jpg-to-pdf';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_IMAGES,
  FREE_MAX_PER_FILE_BYTES,
  FREE_MAX_TOTAL_BYTES,
  JPEG_MAGIC,
  JpgFileMeta,
  MAX_FILENAME_LEN,
  MAX_IMAGES,
  MAX_PER_FILE_BYTES,
  MAX_TOTAL_BYTES,
} from '@/lib/contracts/jpg-convert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReadOk {
  ok: true;
  inputs: JpgAssemblyInput[];
}
interface ReadErr {
  ok: false;
  response: Response;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json({ errors: { files: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

function isJpegMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < JPEG_MAGIC.length) return false;
  for (let i = 0; i < JPEG_MAGIC.length; i++) {
    if (bytes[i] !== JPEG_MAGIC[i]) return false;
  }
  return true;
}

async function readUploads(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxImages = plan === 'PRO' ? MAX_IMAGES : FREE_MAX_IMAGES;
  const maxPerFileBytes = plan === 'PRO' ? MAX_PER_FILE_BYTES : FREE_MAX_PER_FILE_BYTES;
  const maxTotalBytes = plan === 'PRO' ? MAX_TOTAL_BYTES : FREE_MAX_TOTAL_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { files: 'No se pudo leer el formulario' } },
        { status: 400 },
      ),
    };
  }

  const entries = form.getAll('files').filter((e): e is File => e instanceof File && e.size > 0);
  if (entries.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { files: 'Sube al menos una imagen JPG' } },
        { status: 400 },
      ),
    };
  }
  if (entries.length > maxImages) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { files: `Máximo ${maxImages} imágenes` } },
        { status: 400 },
      ),
    };
  }

  const inputs: JpgAssemblyInput[] = [];
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const filename = entry instanceof File && entry.name ? entry.name : `imagen-${i + 1}.jpg`;
    if (filename.length > MAX_FILENAME_LEN) {
      return {
        ok: false,
        response: fieldError(`El nombre de "${filename}" es demasiado largo`, 400),
      };
    }
    if (entry.size > maxPerFileBytes) {
      return {
        ok: false,
        response: fieldError(
          `La imagen "${filename}" supera ${(maxPerFileBytes / (1024 * 1024)).toFixed(0)} MB`,
          413,
        ),
      };
    }
    const meta = JpgFileMeta.safeParse({ filename, sizeBytes: entry.size });
    if (!meta.success) {
      return {
        ok: false,
        response: fieldError(`La imagen "${filename}" no es válida`, 400),
      };
    }
    total += entry.size;
    if (total > maxTotalBytes) {
      return {
        ok: false,
        response: fieldError(
          `El total de las imágenes supera ${(maxTotalBytes / (1024 * 1024)).toFixed(0)} MB`,
          413,
        ),
      };
    }
    const buffer = await entry.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!isJpegMagic(bytes)) {
      return {
        ok: false,
        response: NextResponse.json(
          { errors: { files: `"${filename}" no es un JPG válido (cabecera incorrecta)` } },
          { status: 400 },
        ),
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
    const result = await assembleJpegsToPdf(upload.inputs);
    const first = upload.inputs[0];
    const filename = first ? first.filename : 'imagen.jpg';
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForJpg(filename, 'application/pdf')}"`,
        'cache-control': 'no-store',
        'x-images': String(result.count),
      },
    });
  } catch (err) {
    if (err instanceof JpgAssemblyError) {
      if (err.code === 'timeout') return plainError(err.message, 504);
      return fieldError(err.message, 400);
    }
    return plainError('No se pudo ensamblar el PDF', 500);
  }
}
