import 'server-only';
import sharp from 'sharp';

import {
  detectImageMagic,
  type ImageAccept,
  type ImageTargetFormat,
} from '@/lib/contracts/image-convert';

export class ImageConvertError extends Error {
  constructor(
    public readonly code:
      | 'invalid_image'
      | 'decode_failed'
      | 'unsupported_source'
      | 'unsupported_target'
      | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

const CONVERT_TIMEOUT_MS = 20_000;

function raceTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new ImageConvertError('timeout', `${what} tardó demasiado`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function detectSource(bytes: Uint8Array): ImageAccept {
  const kind = detectImageMagic(bytes);
  if (!kind) {
    throw new ImageConvertError(
      'invalid_image',
      'El archivo no es una imagen válida (cabecera incorrecta)',
    );
  }
  return kind;
}

const FORMAT_PARAMS: Partial<Record<ImageTargetFormat, Record<string, unknown>>> = {
  jpeg: { quality: 90, mozjpeg: true },
  webp: { quality: 90 },
  png: { compressionLevel: 9, palette: true },
};

const ALLOWED_TARGETS: readonly ImageTargetFormat[] = ['jpeg', 'png', 'webp', 'gif'];

export async function convertImage(
  bytes: Uint8Array,
  target: ImageTargetFormat,
): Promise<Uint8Array> {
  if (!ALLOWED_TARGETS.includes(target)) {
    throw new ImageConvertError('unsupported_target', 'Formato de destino no soportado');
  }

  const work = (async () => {
    const params = FORMAT_PARAMS[target] ?? {};
    const pipeline = sharp(bytes, { failOn: 'error' }).toFormat(target, params);
    const out = await pipeline.toBuffer();
    return new Uint8Array(out);
  })();

  try {
    return await raceTimeout(work, CONVERT_TIMEOUT_MS, 'Conversión de la imagen');
  } catch (err) {
    if (err instanceof ImageConvertError) throw err;
    throw new ImageConvertError(
      'decode_failed',
      'No se pudo convertir la imagen (archivo corrupto o formato no soportado)',
    );
  }
}
