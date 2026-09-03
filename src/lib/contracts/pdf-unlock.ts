import { z } from 'zod';

import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const MAX_UNLOCK_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_PAGES = 100;
export const MAX_PASSWORD_LEN = 64;

export const PdfUnlockPassword = z.string().min(1).max(MAX_PASSWORD_LEN);
export type PdfUnlockPassword = z.infer<typeof PdfUnlockPassword>;

export const PdfUnlockInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_UNLOCK_BYTES),
});
export type PdfUnlockInputMeta = z.infer<typeof PdfUnlockInputMeta>;

export const PdfUnlockFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfUnlockFieldErrors = z.infer<typeof PdfUnlockFieldErrors>;

export const PdfUnlockServerError = z.object({
  error: z.string(),
});
export type PdfUnlockServerError = z.infer<typeof PdfUnlockServerError>;
