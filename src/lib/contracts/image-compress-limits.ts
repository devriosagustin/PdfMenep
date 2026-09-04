import { PRO_SCALE } from '@/lib/billing/plan-scale';

export const FREE_MAX_COMPRESS_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_COMPRESS_BYTES = FREE_MAX_COMPRESS_BYTES * PRO_SCALE; // 30 MB — PRO ceiling
export const FREE_MAX_COMPRESS_FILES = 20;
export const MAX_COMPRESS_FILES = FREE_MAX_COMPRESS_FILES * PRO_SCALE; // PRO ceiling
