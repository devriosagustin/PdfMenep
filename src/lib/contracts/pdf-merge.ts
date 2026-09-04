import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const FREE_MAX_PDFS = 10;
export const MAX_PDFS = FREE_MAX_PDFS * PRO_SCALE; // PRO ceiling
export const FREE_MAX_PER_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_PER_FILE_BYTES = FREE_MAX_PER_FILE_BYTES * PRO_SCALE; // 60 MB — PRO ceiling
export const FREE_MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_TOTAL_BYTES = FREE_MAX_TOTAL_BYTES * PRO_SCALE; // 180 MB — PRO ceiling

export const PdfMergeInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_PER_FILE_BYTES),
});

export type PdfMergeInputMeta = z.infer<typeof PdfMergeInputMeta>;

export const PdfMergeError = z.object({
  error: z.string(),
});
export type PdfMergeError = z.infer<typeof PdfMergeError>;

export const PdfMergeFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfMergeFieldErrors = z.infer<typeof PdfMergeFieldErrors>;
