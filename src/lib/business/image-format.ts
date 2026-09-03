import type { ImageTargetFormat } from '@/lib/contracts/image-convert';
import { TARGET_EXTENSIONS } from '@/lib/contracts/image-convert';

export function stripImageExtension(filename: string): string {
  const trimmed = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120);
  const withoutExt = trimmed.replace(/\.(png|jpe?g|webp|gif)$/i, '');
  return withoutExt || 'imagen';
}

export function downloadNameFor(filename: string, target: ImageTargetFormat): string {
  const stem = stripImageExtension(filename);
  return `${stem}.${TARGET_EXTENSIONS[target]}`;
}

export { filenameFromContentDisposition } from '@/lib/business/pdf-format';
