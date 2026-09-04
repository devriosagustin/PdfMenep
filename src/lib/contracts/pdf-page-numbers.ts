import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const FREE_MAX_PAGE_NUMBERS_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_PAGE_NUMBERS_BYTES = FREE_MAX_PAGE_NUMBERS_BYTES * PRO_SCALE; // 180 MB — PRO ceiling

export const PdfNumberPosition = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);
export type PdfNumberPosition = z.infer<typeof PdfNumberPosition>;

export const PdfPageNumbersInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_PAGE_NUMBERS_BYTES),
});
export type PdfPageNumbersInputMeta = z.infer<typeof PdfPageNumbersInputMeta>;

export const PdfPageNumbersFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfPageNumbersFieldErrors = z.infer<typeof PdfPageNumbersFieldErrors>;

export const PdfPageNumbersServerError = z.object({
  error: z.string(),
});
export type PdfPageNumbersServerError = z.infer<typeof PdfPageNumbersServerError>;

// Spanish error strings — keep in lockstep with the API route handlers.
export const ERROR_NO_FILE = 'Sube un archivo PDF en el campo "file"';
export const ERROR_NOT_PDF = 'El archivo no es un PDF válido (cabecera incorrecta)';
export const ERROR_READ_FORM = 'No se pudo leer el formulario';
export const ERROR_NO_POSITION = 'Selecciona la posición del número';
export const ERROR_INVALID_POSITION =
  'Posición no válida. Usa una de las 6 opciones (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right)';
export const ERROR_NO_STARTING_NUMBER = 'Indica el número desde el que empezar';
export const ERROR_INVALID_STARTING_NUMBER =
  'El número de inicio debe ser un entero mayor o igual a 1';
export const ERROR_PAGE_NUMBERS_FAILED =
  'No se pudo numerar el PDF. Inténtalo de nuevo con otro archivo';
