import { z } from 'zod';

import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const MAX_REPAIR_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_PASSWORD_LEN = 64;

// Optional password. An empty string is a valid "no password" sentinel
// (distinct from null/absent) — empty is treated as "no password supplied"
// by the route handler so the user can flip the toggled-off state.
export const PdfRepairPassword = z.string().min(0).max(MAX_PASSWORD_LEN).optional();
export type PdfRepairPassword = z.infer<typeof PdfRepairPassword>;

export const PdfRepairInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_REPAIR_BYTES),
});
export type PdfRepairInputMeta = z.infer<typeof PdfRepairInputMeta>;

export const PdfRepairFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfRepairFieldErrors = z.infer<typeof PdfRepairFieldErrors>;

export const PdfRepairServerError = z.object({
  error: z.string(),
});
export type PdfRepairServerError = z.infer<typeof PdfRepairServerError>;
