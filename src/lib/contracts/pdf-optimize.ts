import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const FREE_MAX_OPTIMIZE_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_OPTIMIZE_BYTES = FREE_MAX_OPTIMIZE_BYTES * PRO_SCALE; // 180 MB — PRO ceiling

export const PdfOptimizeLevel = z.enum(['baja', 'media', 'alta']);
export type PdfOptimizeLevel = z.infer<typeof PdfOptimizeLevel>;

export const PdfOptimizeInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_OPTIMIZE_BYTES),
});

export type PdfOptimizeInputMeta = z.infer<typeof PdfOptimizeInputMeta>;

export const PdfOptimizeFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfOptimizeFieldErrors = z.infer<typeof PdfOptimizeFieldErrors>;

export const PdfOptimizeServerError = z.object({
  error: z.string(),
});
export type PdfOptimizeServerError = z.infer<typeof PdfOptimizeServerError>;

// Spanish error strings — keep in lockstep with the API route handlers.
export const ERROR_NOT_PDF = 'El archivo no es un PDF válido (cabecera incorrecta)';
export const ERROR_FILE_TOO_LARGE = `El PDF supera 60 MB`;
export const ERROR_NO_FILE = 'Sube un archivo PDF en el campo "file"';
export const ERROR_READ_FORM = 'No se pudo leer el formulario';
export const ERROR_NO_LEVEL = 'Selecciona un nivel (Baja, Media o Alta)';
export const ERROR_INVALID_LEVEL = 'Nivel de compresión inválido. Usa "Baja", "Media" o "Alta"';
export const ERROR_PDF_PASSWORD =
  'El PDF está protegido con contraseña. Quita la contraseña antes de comprimirlo';
export const ERROR_OPTIMIZE_FAILED =
  'No se pudo comprimir el PDF. Inténtalo de nuevo con otro archivo';
