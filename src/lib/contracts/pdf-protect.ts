import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const FREE_MAX_PROTECT_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_PROTECT_BYTES = FREE_MAX_PROTECT_BYTES * PRO_SCALE; // 180 MB — PRO ceiling
export const MAX_PAGES = 100;
export const MIN_PASSWORD_LEN = 4;
export const MAX_PASSWORD_LEN = 64;

// Informational strength enum. Strictly a UX hint — the client uses it to
// badge "weak / medium / strong" while the user types, but submit is NOT
// gated on strength (the server validates via the password-length and
// pdf-lib encrypt bound). Useful so a future analytics pass can correlate
// strength with upload volume without a contract change.
export const PdfProtectStrength = z.enum(['weak', 'medium', 'strong']);
export type PdfProtectStrength = z.infer<typeof PdfProtectStrength>;

export const PdfProtectPassword = z.string().min(MIN_PASSWORD_LEN).max(MAX_PASSWORD_LEN);
export type PdfProtectPassword = z.infer<typeof PdfProtectPassword>;

export const PdfProtectInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_PROTECT_BYTES),
});
export type PdfProtectInputMeta = z.infer<typeof PdfProtectInputMeta>;

export const PdfProtectFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfProtectFieldErrors = z.infer<typeof PdfProtectFieldErrors>;

export const PdfProtectServerError = z.object({
  error: z.string(),
});
export type PdfProtectServerError = z.infer<typeof PdfProtectServerError>;

// Pure helper — duplicated by both the client island (UX strength badge)
// and any helpers in the route layer so they never drift. Counts distinct
// character classes (lowercase / uppercase / digit / symbol). The length
// is the primary lever; char-class diversity nudges "medium" → "strong".
export function classifyPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  const len = password.length;
  if (len === 0) return 'weak';
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/\d/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  if (len >= 14 && classes >= 3) return 'strong';
  if (len >= 10 && classes >= 2) return 'strong';
  if (len >= 8 && classes >= 2) return 'medium';
  if (len >= MIN_PASSWORD_LEN && classes >= 1) return 'medium';
  return 'weak';
}
