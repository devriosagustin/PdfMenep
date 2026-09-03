export function stripJpgExtension(filename: string): string {
  const trimmed = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120);
  return trimmed.replace(/\.jpe?g$/i, '') || 'imagen';
}

export function downloadNameForJpg(filename: string, contentType: string): string {
  const base = stripJpgExtension(filename);
  if (contentType.startsWith('application/pdf')) return `${base}.pdf`;
  return `${base}.bin`;
}

export { filenameFromContentDisposition } from '@/lib/business/pdf-format';
