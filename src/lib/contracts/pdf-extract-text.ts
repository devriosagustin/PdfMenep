import { z } from 'zod';

import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
} from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, MAX_PAGES, MAX_UPLOAD_BYTES, PDF_MAGIC };

export const PdfExtractTextInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type PdfExtractTextInputMeta = z.infer<typeof PdfExtractTextInputMeta>;

export const PdfExtractTextFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfExtractTextFieldErrors = z.infer<typeof PdfExtractTextFieldErrors>;

export const PdfExtractTextServerError = z.object({
  error: z.string(),
});
export type PdfExtractTextServerError = z.infer<typeof PdfExtractTextServerError>;
