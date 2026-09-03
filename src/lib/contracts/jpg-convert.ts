import { z } from 'zod';

export const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];
export const MAX_PER_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_IMAGES = 30;
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
