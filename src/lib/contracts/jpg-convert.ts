import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';

export const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];
export const FREE_MAX_PER_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PER_FILE_BYTES = FREE_MAX_PER_FILE_BYTES * PRO_SCALE; // 15 MB — PRO ceiling
export const FREE_MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_TOTAL_BYTES = FREE_MAX_TOTAL_BYTES * PRO_SCALE; // 60 MB — PRO ceiling
export const FREE_MAX_IMAGES = 30;
export const MAX_IMAGES = FREE_MAX_IMAGES * PRO_SCALE; // PRO ceiling
export const MAX_FILENAME_LEN = 200;

export const JpgFileMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_PER_FILE_BYTES),
});

export type JpgFileMeta = z.infer<typeof JpgFileMeta>;

export const JpgServerError = z.object({
  error: z.string(),
});
export type JpgServerError = z.infer<typeof JpgServerError>;

export const JpgServerFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type JpgServerFieldErrors = z.infer<typeof JpgServerFieldErrors>;
