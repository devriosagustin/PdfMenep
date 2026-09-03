import 'server-only';
import sharp from 'sharp';

import {
  COMPRESS_TIMEOUT_MS,
  type CompressedFormat,
  detectCompressibleMagic,
} from '@/lib/contracts/image-compress';

export class ImageCompressError extends Error {
  constructor(
    public readonly code: 'not_compressible' | 'decode_failed' | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

export interface CompressResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  source: CompressedFormat;
}

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new ImageCompressError('timeout', '')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function detectCompressibleSource(bytes: Uint8Array): CompressedFormat {
  const kind = detectCompressibleMagic(bytes);
  if (!kind) {
    throw new ImageCompressError('not_compressible', '');
  }
  return kind;
}

export async function compressImage(bytes: Uint8Array, quality: number): Promise<CompressResult> {
  const source = detectCompressibleSource(bytes);

  const work = (async () => {
    const pipeline = sharp(bytes, { failOn: 'error' });
    const meta = await pipeline.metadata();

    const reencode =
      source === 'jpeg'
        ? pipeline.jpeg({ quality, mozjpeg: true })
        : source === 'png'
          ? pipeline.png({ compressionLevel: 9, palette: true })
          : pipeline.webp({ quality, effort: 4 });

    const out = await reencode.toBuffer({ resolveWithObject: true });
    return {
      bytes: new Uint8Array(out.data),
      width: out.info.width ?? meta.width ?? 0,
      height: out.info.height ?? meta.height ?? 0,
      source,
    };
  })();

  try {
    return await raceTimeout(work, COMPRESS_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof ImageCompressError) throw err;
    throw new ImageCompressError('decode_failed', '');
  }
}

export function extensionFor(source: CompressedFormat): 'jpg' | 'png' | 'webp' {
  return source === 'jpeg' ? 'jpg' : source === 'png' ? 'png' : 'webp';
}
