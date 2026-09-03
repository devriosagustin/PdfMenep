import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_PAGES = 30;
export const PDF_MAGIC = '%PDF-';
export const MAX_FILENAME_LEN = 200;

export const PdfInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type PdfInputMeta = z.infer<typeof PdfInputMeta>;

export const PdfServerError = z.object({
  error: z.string(),
});
export type PdfServerError = z.infer<typeof PdfServerError>;
