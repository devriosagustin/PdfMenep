import { z } from 'zod';

import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const MAX_WATERMARK_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_TEXT_LEN = 80;
export const MAX_FONT_SIZE = 72;
export const MIN_FONT_SIZE = 8;
export const MIN_OPACITY = 10;
export const MAX_OPACITY = 100;

export const PdfWatermarkMode = z.enum(['text', 'image']);
export type PdfWatermarkMode = z.infer<typeof PdfWatermarkMode>;

export const PdfWatermarkPosition = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
export type PdfWatermarkPosition = z.infer<typeof PdfWatermarkPosition>;

export const PdfWatermarkTilt = z.union([z.literal(-45), z.literal(0), z.literal(45)]);
export type PdfWatermarkTilt = z.infer<typeof PdfWatermarkTilt>;

export const PdfWatermarkText = z.string().min(1).max(MAX_TEXT_LEN);
export type PdfWatermarkText = z.infer<typeof PdfWatermarkText>;

export const PdfWatermarkOpacity = z.number().int().min(MIN_OPACITY).max(MAX_OPACITY);
export type PdfWatermarkOpacity = z.infer<typeof PdfWatermarkOpacity>;

export const PdfWatermarkFontSize = z.number().int().min(MIN_FONT_SIZE).max(MAX_FONT_SIZE);
export type PdfWatermarkFontSize = z.infer<typeof PdfWatermarkFontSize>;

export const PdfWatermarkInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_WATERMARK_BYTES),
});
export type PdfWatermarkInputMeta = z.infer<typeof PdfWatermarkInputMeta>;

export const PdfWatermarkImageMeta = z.object({
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
  contentType: z.string().min(1).max(80),
});
export type PdfWatermarkImageMeta = z.infer<typeof PdfWatermarkImageMeta>;

export const PdfWatermarkFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfWatermarkFieldErrors = z.infer<typeof PdfWatermarkFieldErrors>;

export const PdfWatermarkServerError = z.object({
  error: z.string(),
});
export type PdfWatermarkServerError = z.infer<typeof PdfWatermarkServerError>;
