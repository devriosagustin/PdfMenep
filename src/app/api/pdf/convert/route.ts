import 'server-only';
import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { downloadNameFor } from '@/lib/business/pdf-format';
import {
  PdfRasterError,
  type RasterResult,
  rasterizePdfToJpeg,
} from '@/lib/business/pdf-rasterize';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  PdfInputMeta,
} from '@/lib/contracts/pdf-convert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE_NAME_PADDING = 3;

function pad(n: number): string {
  return n.toString().padStart(PAGE_NAME_PADDING, '0');
}

interface ReadOk {
  ok: true;
  filename: string;
  sizeBytes: number;
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
      response: NextResponse.json({ error: 'No se pudo leer el formulario' }, { status: 400 }),
    };
  }
  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { file: 'Sube un archivo PDF en el campo "file"' } },
        { status: 400 },
      ),
    };
  }
  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          errors: {
            file: `El archivo supera ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
          },
        },
        { status: 413 },
      ),
    };
  }
  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfInputMeta.safeParse({ filename, sizeBytes: entry.size });
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
    sizeBytes: meta.data.sizeBytes,
    bytes: new Uint8Array(buffer),
  };
}

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

async function responseFromRaster(filename: string, raster: RasterResult): Promise<Response> {
  if (raster.pages.length === 1) {
    const page = raster.pages[0];
    if (!page) {
      return plainError('No se pudo obtener la página', 500);
    }
    return new Response(new Uint8Array(page.jpeg), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(page.jpeg.byteLength),
        'content-disposition': `attachment; filename="${downloadNameFor(filename, 'image/jpeg')}"`,
        'cache-control': 'no-store',
        'x-pages': '1',
      },
    });
  }
  const zip = new JSZip();
  for (const p of raster.pages) {
    zip.file(`page-${pad(p.index)}.jpg`, p.jpeg);
  }
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const zipLen = (zipBuf as Buffer).byteLength;
  return new Response(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-length': String(zipLen),
      'content-disposition': `attachment; filename="${downloadNameFor(filename, 'application/zip')}"`,
      'cache-control': 'no-store',
      'x-pages': String(raster.pages.length),
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  if (!isPdfMagic(upload.bytes)) {
    return fieldError('El archivo no es un PDF válido (cabecera incorrecta)', 400);
  }

  try {
    const raster = await rasterizePdfToJpeg(upload.bytes);
    return await responseFromRaster(upload.filename, raster);
  } catch (err) {
    if (err instanceof PdfRasterError) {
      if (err.code === 'timeout') return plainError(err.message, 504);
      return fieldError(err.message, 400);
    }
    return plainError('No se pudo convertir el PDF', 500);
  }
}
