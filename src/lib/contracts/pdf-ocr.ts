import { z } from 'zod';

import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const MAX_OCR_BYTES = 60 * 1024 * 1024; // 60 MB — mirrors the rotate / crop / watermark family
export const MAX_OCR_PAGES = 30;

// 2-letter language code the OCR backend speaks. `es` and `en` are the only
// values the iso routes send — picked (instead of an open string) so the wire
// payload is a literal union and a typo answers with a 4xx, never a
// silently-empty OCR result.
export const PdfOcrLanguage = z.enum(['es', 'en']);
export type PdfOcrLanguage = z.infer<typeof PdfOcrLanguage>;

export const PdfOcrInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_OCR_BYTES),
});
export type PdfOcrInputMeta = z.infer<typeof PdfOcrInputMeta>;

// Flat comma-separated page list ("1,3,5-7") — bounded by the same byte cap
// as the rest of the wire payloads so a malicious jumbo string gets rejected
// before it round-trips into the route handler's friendly mapper.
export const PdfOcrPages = z.string().min(1).max(2_000);
export type PdfOcrPages = z.infer<typeof PdfOcrPages>;

export const PdfOcrFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfOcrFieldErrors = z.infer<typeof PdfOcrFieldErrors>;

export const PdfOcrServerError = z.object({
  error: z.string(),
});
export type PdfOcrServerError = z.infer<typeof PdfOcrServerError>;
