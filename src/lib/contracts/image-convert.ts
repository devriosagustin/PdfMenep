import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILENAME_LEN = 200;

export type ImageAccept = 'jpeg' | 'png' | 'webp' | 'gif';

export const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];
export const PNG_MAGIC: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const RIFF_MAGIC: readonly number[] = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
export const WEBP_MAGIC: readonly number[] = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
export const GIF87A_MAGIC: readonly number[] = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
export const GIF89A_MAGIC: readonly number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

export const ImageTargetFormat = z.enum(['jpeg', 'png', 'webp', 'gif']);
export type ImageTargetFormat = z.infer<typeof ImageTargetFormat>;

export const ACCEPT_ATTRIBUTE =
  'image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp,image/gif,.gif';

export const CONTENT_TYPES: Record<ImageTargetFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const TARGET_EXTENSIONS: Record<ImageTargetFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
};

export const TARGET_LABELS: Record<ImageTargetFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
};

export const TARGET_OPTIONS: readonly ImageTargetFormat[] = ['jpeg', 'png', 'webp', 'gif'];

export const ImageFileMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type ImageFileMeta = z.infer<typeof ImageFileMeta>;

export const ImageServerError = z.object({
  error: z.string(),
});
export type ImageServerError = z.infer<typeof ImageServerError>;

export const ImageServerFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type ImageServerFieldErrors = z.infer<typeof ImageServerFieldErrors>;

function bytesStartWith(bytes: Uint8Array, needle: readonly number[]): boolean {
  if (bytes.byteLength < needle.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (bytes[i] !== needle[i]) return false;
  }
  return true;
}

export function detectImageMagic(bytes: Uint8Array): ImageAccept | null {
  if (bytesStartWith(bytes, JPEG_MAGIC)) return 'jpeg';
  if (bytesStartWith(bytes, PNG_MAGIC)) return 'png';
  if (bytesStartWith(bytes, RIFF_MAGIC)) {
    if (bytes.byteLength >= 12 && bytesStartWith(bytes.subarray(8, 12), WEBP_MAGIC)) {
      return 'webp';
    }
  }
  if (bytesStartWith(bytes, GIF87A_MAGIC) || bytesStartWith(bytes, GIF89A_MAGIC)) {
    return 'gif';
  }
  return null;
}
