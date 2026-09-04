import 'server-only';
import { NextResponse } from 'next/server';
import { type CropOriginH, cropPdfPages, PdfCropError } from '@/lib/business/pdf-crop';
import { downloadNameForCrop } from '@/lib/business/pdf-format';
import { getCurrentPlan } from '@/lib/billing/plan-limits';
import {
  FREE_MAX_CROP_BYTES,
  MAX_CROP_BYTES,
  MAX_FILENAME_LEN,
  MAX_PDF_BOX_MM,
  type PdfCropBox,
  PdfCropBoxEnvelope,
  type PdfCropFieldErrors,
  PdfCropInputMeta,
} from '@/lib/contracts/pdf-crop';
import { friendlyCropError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfCropFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  // The route passes a fully-validated {x, y, width, height} box in the
  // top-left coordinate space (originH='top' by default). For bottom-left
  // origin we flip the y anchor inside the route so the business module
  // keeps its top-left model.
  box: PdfCropBox & { originH: CropOriginH };
}
interface ReadErr {
  ok: false;
  response: Response;
}

// The wire envelope is a free-form JSON object — translate a failed parse
// into the copy the client island preview panel renders inline.
function mapBoxParseError(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return friendlyCropError('no_box');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return friendlyCropError('invalid_box');
  }
  if (!parsed || typeof parsed !== 'object') {
    return friendlyCropError('invalid_box');
  }
  const record = parsed as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  // originH is optional in the wire shape — the client may include it for
  // round-tripping but the route never reads it as the source of truth.
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const v = record[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      return friendlyCropError('invalid_box');
    }
  }
  const xVal = record.x as number;
  const yVal = record.y as number;
  const wVal = record.width as number;
  const hVal = record.height as number;
  if (wVal === 0 || hVal === 0) {
    return friendlyCropError('invalid_box');
  }
  if (xVal + wVal > MAX_PDF_BOX_MM || yVal + hVal > MAX_PDF_BOX_MM) {
    return friendlyCropError('out_of_range_box');
  }
  return friendlyCropError('invalid_box');
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  const plan = await getCurrentPlan();
  const maxBytes = plan === 'PRO' ? MAX_CROP_BYTES : FREE_MAX_CROP_BYTES;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyCropError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyCropError('no_file'), 400),
    };
  }

  if (entry.size > maxBytes) {
    return {
      ok: false,
      response: fieldError(friendlyCropError('file_too_big', { mb: maxBytes / (1024 * 1024) }), 413),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfCropInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyCropError('filename_too_long', { filename })
        : friendlyCropError('invalid_pdf_meta', { filename });
    return {
      ok: false,
      response: fieldError(reason, 400),
    };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const boxRaw = form.get('box');
  const boxValue = typeof boxRaw === 'string' ? boxRaw : '';
  const parsedBox = PdfCropBoxEnvelope.safeParse(boxValue);
  if (!parsedBox.success) {
    return {
      ok: false,
      response: fieldError(mapBoxParseError(boxValue), 400),
    };
  }

  // The wire envelope doesn't carry originH — but the client posts a
  // separate `origin` field ('top' | 'bottom'). Read both so the route
  // mirrors the client island.
  const originRaw = form.get('origin');
  const originH: CropOriginH = originRaw === 'bottom' ? 'bottom' : 'top';

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    box: { ...parsedBox.data, originH },
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    // The wire envelope gives a top-left {x, y, width, height} in mm
    // regardless of origin. Convert bottom-left → top-left here so the
    // business module keeps a single coordinate convention (top-left).
    // page height is not known at this point, so the per-page boundary is
    // enforced by the business module's `Math.max(0, …)` guard on the bo
    // ttom y anchor.
    const result = await cropPdfPages({
      bytes: upload.bytes,
      x: upload.box.x,
      y: upload.box.y,
      width: upload.box.width,
      height: upload.box.height,
      originH: upload.box.originH,
    });
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForCrop(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfCropError) {
      if (err.code === 'timeout') {
        return plainError(friendlyCropError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlyCropError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        const code = err.reason === 'password' ? 'invalid_pdf_password' : 'invalid_pdf_corrupt';
        return fieldError(friendlyCropError(code, { filename: upload.filename }), 400);
      }
      return fieldError(friendlyCropError('crop_failed'), 422);
    }
    return plainError(friendlyCropError('unexpected'), 500);
  }
}
