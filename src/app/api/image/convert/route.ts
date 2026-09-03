import 'server-only';
import { NextResponse } from 'next/server';

import { convertImage, detectSource, ImageConvertError } from '@/lib/business/image-convert';
import { downloadNameFor } from '@/lib/business/image-format';
import {
  CONTENT_TYPES,
  ImageFileMeta,
  ImageTargetFormat,
  MAX_UPLOAD_BYTES,
} from '@/lib/contracts/image-convert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  target: ImageTargetFormat;
}
interface ReadErr {
  ok: false;
  response: Response;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No se pudo leer el formulario' }, { status: 400 }),
    };
  }

  const targetRaw = form.get('target');
  const targetParse = ImageTargetFormat.safeParse(typeof targetRaw === 'string' ? targetRaw : null);
  if (!targetParse.success) {
    return {
      ok: false,
      response: fieldError('Formato de destino no soportado', 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { file: 'Sube una imagen en el campo "file"' } },
        { status: 400 },
      ),
    };
  }
  if (entry.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          errors: {
            file: `El archivo supera ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB`,
          },
        },
        { status: 413 },
      ),
    };
  }
  const filename = entry instanceof File && entry.name ? entry.name : 'imagen';
  const meta = ImageFileMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const first = meta.error.issues[0];
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { file: first?.message ?? 'Archivo no válido' } },
        { status: 400 },
      ),
    };
  }
  const buffer = await entry.arrayBuffer();
  return {
    ok: true,
    filename: meta.data.filename,
    bytes: new Uint8Array(buffer),
    target: targetParse.data,
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  let source: ReturnType<typeof detectSource>;
  try {
    source = detectSource(upload.bytes);
  } catch (err) {
    if (err instanceof ImageConvertError) {
      return fieldError(err.message, 400);
    }
    return plainError('No se pudo leer la imagen', 500);
  }

  try {
    const outBytes = await convertImage(upload.bytes, upload.target);
    const downloadName = downloadNameFor(upload.filename, upload.target);
    const contentType = CONTENT_TYPES[upload.target];
    const headers: Record<string, string> = {
      'content-type': contentType,
      'content-length': String(outBytes.byteLength),
      'content-disposition': `attachment; filename="${downloadName}"`,
      'cache-control': 'no-store',
      [`x-source-${source}`]: '1',
      [`x-target-${upload.target}`]: '1',
    };
    return new Response(new Uint8Array(outBytes), { status: 200, headers });
  } catch (err) {
    if (err instanceof ImageConvertError) {
      if (err.code === 'timeout') return plainError(err.message, 504);
      return fieldError(err.message, 400);
    }
    return plainError('No se pudo convertir la imagen', 500);
  }
}
