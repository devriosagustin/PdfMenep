import 'server-only';
import { NextResponse } from 'next/server';

import { downloadNameForWatermark } from '@/lib/business/pdf-format';
import { addPdfWatermark, PdfWatermarkError } from '@/lib/business/pdf-watermark';
import {
  MAX_FILENAME_LEN,
  MAX_IMAGE_BYTES,
  MAX_TEXT_LEN,
  MAX_WATERMARK_BYTES,
  MIN_FONT_SIZE,
  MIN_OPACITY,
  PDF_MAGIC,
  type PdfWatermarkFieldErrors,
  PdfWatermarkFontSize,
  PdfWatermarkImageMeta,
  PdfWatermarkInputMeta,
  PdfWatermarkMode as PdfWatermarkModeZ,
  PdfWatermarkOpacity,
  type PdfWatermarkPosition,
  PdfWatermarkPosition as PdfWatermarkPositionZ,
  type PdfWatermarkServerError,
  type PdfWatermarkTilt,
  PdfWatermarkTilt as PdfWatermarkTiltZ,
} from '@/lib/contracts/pdf-watermark';
import { friendlyWatermarkError } from '@/lib/errors/friendly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface ReadOk {
  ok: true;
  filename: string;
  bytes: Uint8Array;
  input: import('@/lib/business/pdf-watermark').PdfWatermarkInput;
}
interface ReadErr {
  ok: false;
  response: Response;
}

function fieldError(message: string, status: number): Response {
  return NextResponse.json<PdfWatermarkFieldErrors>({ errors: { file: message } }, { status });
}

function plainError(message: string, status: number): Response {
  return NextResponse.json<PdfWatermarkServerError>({ error: message }, { status });
}

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

// PNG / JPG magic-byte sniff — a small, locale-independent check.
function isImageMagic(bytes: Uint8Array, contentType: string): boolean {
  if (contentType.includes('png')) {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.byteLength < sig.length) return false;
    for (let i = 0; i < sig.length; i++) {
      if (bytes[i] !== sig[i]) return false;
    }
    return true;
  }
  if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    if (bytes.byteLength < 3) return false;
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

async function readUpload(req: Request): Promise<ReadOk | ReadErr> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('read_form_failed'), 400),
    };
  }

  const entry = form.get('file');
  if (!(entry instanceof Blob) || entry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('no_file'), 400),
    };
  }
  if (entry.size > MAX_WATERMARK_BYTES) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('file_too_big', { mb: 60 }), 413),
    };
  }

  const filename = entry instanceof File && entry.name ? entry.name : 'archivo.pdf';
  const meta = PdfWatermarkInputMeta.safeParse({ filename, sizeBytes: entry.size });
  if (!meta.success) {
    const reason =
      filename.length > MAX_FILENAME_LEN
        ? friendlyWatermarkError('filename_too_long', { filename })
        : friendlyWatermarkError('invalid_pdf_meta', { filename });
    return { ok: false, response: fieldError(reason, 400) };
  }

  const buffer = await entry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isPdfMagic(bytes)) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('bad_magic', { filename }), 400),
    };
  }

  // Mode — required, 'text' | 'image'.
  const modeRaw = form.get('mode');
  if (typeof modeRaw !== 'string' || modeRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('no_mode'), 400),
    };
  }
  const modeParsed = PdfWatermarkModeZ.safeParse(modeRaw.trim());
  if (!modeParsed.success) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_mode'), 400),
    };
  }
  const mode = modeParsed.data;

  // Position — required.
  const positionRaw = form.get('position');
  if (typeof positionRaw !== 'string' || positionRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('no_position'), 400),
    };
  }
  const positionParsed = PdfWatermarkPositionZ.safeParse(positionRaw.trim());
  if (!positionParsed.success) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_position'), 400),
    };
  }
  const position: PdfWatermarkPosition = positionParsed.data;

  // Opacity — 10..100 integer.
  const opacityRaw = form.get('opacity');
  if (typeof opacityRaw !== 'string' || opacityRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('no_opacity'), 400),
    };
  }
  const trimmedOpacity = opacityRaw.trim();
  if (!/^\d+$/.test(trimmedOpacity)) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_opacity'), 400),
    };
  }
  const opacityNum = Number.parseInt(trimmedOpacity, 10);
  const opacityParsed = PdfWatermarkOpacity.safeParse(opacityNum);
  if (!opacityParsed.success || opacityNum < MIN_OPACITY) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_opacity'), 400),
    };
  }

  // Tilt — required, must be one of -45 | 0 | 45 (literal union).
  const tiltRaw = form.get('tiltDeg');
  if (typeof tiltRaw !== 'string' || tiltRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('no_tilt'), 400),
    };
  }
  const tiltNum = Number.parseInt(tiltRaw.trim(), 10);
  const tiltParsed = PdfWatermarkTiltZ.safeParse(tiltNum);
  if (!tiltParsed.success) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_tilt'), 400),
    };
  }
  const tiltDeg: PdfWatermarkTilt = tiltParsed.data;

  // Font size — required by contract (a default is applied if absent on
  // text mode elsewhere, but the wire surface demands a value for both
  // modes to keep the route handler zero-side-effect).
  const fontSizeRaw = form.get('fontSize');
  if (typeof fontSizeRaw !== 'string' || fontSizeRaw.trim().length === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('no_font_size'), 400),
    };
  }
  const trimmedFontSize = fontSizeRaw.trim();
  if (!/^\d+$/.test(trimmedFontSize)) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_font_size'), 400),
    };
  }
  const fontNum = Number.parseInt(trimmedFontSize, 10);
  const fontParsed = PdfWatermarkFontSize.safeParse(fontNum);
  if (!fontParsed.success || fontNum < MIN_FONT_SIZE) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_font_size'), 400),
    };
  }

  if (mode === 'text') {
    const textRaw = form.get('text');
    if (typeof textRaw !== 'string' || textRaw.length === 0) {
      return {
        ok: false,
        response: fieldError(friendlyWatermarkError('no_text'), 400),
      };
    }
    if (textRaw.length > MAX_TEXT_LEN) {
      return {
        ok: false,
        response: fieldError(friendlyWatermarkError('text_too_long'), 400),
      };
    }

    return {
      ok: true,
      filename: meta.data.filename,
      bytes,
      input: {
        mode: 'text',
        bytes,
        text: textRaw,
        position,
        opacity: opacityNum,
        tiltDeg,
        fontSize: fontNum,
      },
    };
  }

  // mode === 'image'
  const imageEntry = form.get('image');
  if (!(imageEntry instanceof Blob) || imageEntry.size === 0) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('image_required'), 400),
    };
  }
  if (imageEntry.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('image_too_big', { mb: 2 }), 413),
    };
  }
  const imageContentType =
    imageEntry instanceof File && imageEntry.type ? imageEntry.type : 'application/octet-stream';
  const imageMeta = PdfWatermarkImageMeta.safeParse({
    sizeBytes: imageEntry.size,
    contentType: imageContentType,
  });
  if (!imageMeta.success) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_image'), 400),
    };
  }
  const imageBuf = await imageEntry.arrayBuffer();
  const imageBytes = new Uint8Array(imageBuf);
  const kind: 'png' | 'jpg' = imageContentType.includes('png') ? 'png' : 'jpg';
  if (!isImageMagic(imageBytes, imageContentType)) {
    return {
      ok: false,
      response: fieldError(friendlyWatermarkError('invalid_image'), 400),
    };
  }

  return {
    ok: true,
    filename: meta.data.filename,
    bytes,
    input: {
      mode: 'image',
      bytes,
      image: { kind, bytes: imageBytes },
      position,
      opacity: opacityNum,
      tiltDeg,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const upload = await readUpload(req);
  if (!upload.ok) return upload.response;

  try {
    const result = await addPdfWatermark(upload.input);
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(result.pdf.byteLength),
        'content-disposition': `attachment; filename="${downloadNameForWatermark(upload.filename)}"`,
        'cache-control': 'no-store',
        'x-pages': String(result.pageCount),
      },
    });
  } catch (err) {
    if (err instanceof PdfWatermarkError) {
      if (err.code === 'timeout') {
        return plainError(friendlyWatermarkError('timeout'), 504);
      }
      if (err.code === 'empty_doc') {
        return fieldError(friendlyWatermarkError('invalid_pdf_empty'), 400);
      }
      if (err.code === 'invalid_pdf') {
        if (err.reason === 'password') {
          return fieldError(friendlyWatermarkError('invalid_pdf_password'), 400);
        }
        return fieldError(
          friendlyWatermarkError('invalid_pdf_corrupt', { filename: upload.filename }),
          400,
        );
      }
      return fieldError(friendlyWatermarkError('watermark_failed'), 422);
    }
    return plainError(friendlyWatermarkError('unexpected'), 500);
  }
}
