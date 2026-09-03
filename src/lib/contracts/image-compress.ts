import { z } from 'zod';
import { MAX_COMPRESS_BYTES, MAX_COMPRESS_FILES } from '@/lib/contracts/image-compress-limits';
import { friendlyCompressError } from '@/lib/errors/friendly';

export { MAX_COMPRESS_BYTES, MAX_COMPRESS_FILES };
export const DEFAULT_QUALITY = 75;
export const MIN_QUALITY = 1;
export const MAX_QUALITY = 100;
export const MAX_FILENAME_LEN = 200;
export const COMPRESS_TIMEOUT_MS = 20_000;

export const CompressedFormat = z.enum(['jpeg', 'png', 'webp']);
export type CompressedFormat = z.infer<typeof CompressedFormat>;

export const FORMATS: readonly CompressedFormat[] = ['jpeg', 'png', 'webp'];

export const FORMAT_EXTENSIONS: Record<CompressedFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

export const FORMAT_LABELS: Record<CompressedFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
};

export const ACCEPT_ATTRIBUTE = 'image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp';

export const QualityParam = z
  .number()
  .int()
  .min(MIN_QUALITY)
  .max(MAX_QUALITY)
  .default(DEFAULT_QUALITY);
export type QualityParam = z.infer<typeof QualityParam>;

export const CompressFileMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  originalSize: z.number().int().nonnegative(),
  compressedSize: z.number().int().nonnegative(),
  savingsPct: z.number(),
});
export type CompressFileMeta = z.infer<typeof CompressFileMeta>;

export const CompressManifest = z.object({
  generatedAt: z.string(),
  quality: z.number().int().min(MIN_QUALITY).max(MAX_QUALITY),
  totalIn: z.number().int().nonnegative(),
  totalOut: z.number().int().nonnegative(),
  savingsPct: z.number(),
  files: z.array(CompressFileMeta),
});
export type CompressManifest = z.infer<typeof CompressManifest>;

export const CompressFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type CompressFieldErrors = z.infer<typeof CompressFieldErrors>;

export const CompressServerError = z.object({
  error: z.string(),
});
export type CompressServerError = z.infer<typeof CompressServerError>;

// Spanish error strings — delegated to the shared mapper so the route handler
// and the client island render byte-identical copy through a single source.
export const ERROR_NOT_IMAGE = (name: string, formats = 'JPG, PNG ni WebP'): string =>
  friendlyCompressError('bad_magic', { filename: name, formatsHint: formats });
export const ERROR_FILE_TOO_LARGE = (maxMb: number): string =>
  friendlyCompressError('file_too_big', { mb: maxMb });
export const ERROR_TOO_MANY_FILES = friendlyCompressError('too_many_files');
export const ERROR_NO_FILES = friendlyCompressError('no_files');
export const ERROR_INVALID_QUALITY = friendlyCompressError('invalid_quality');

// Magic-byte detection shared with image-convert; here only the compressible
// formats are surfaced (no GIF).
export function detectCompressibleMagic(bytes: Uint8Array): CompressedFormat | null {
  if (bytes.byteLength < 3) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  // WebP: RIFF....WEBP
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}
