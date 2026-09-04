import { z } from 'zod';

import {
  FREE_MAX_UPLOAD_BYTES as PDF_TO_WORD_FREE_MAX_BYTES,
  MAX_FILENAME_LEN,
  PDF_MAGIC,
  MAX_UPLOAD_BYTES as PDF_TO_WORD_MAX_BYTES,
} from '@/lib/contracts/pdf-convert';

export {
  MAX_FILENAME_LEN,
  PDF_MAGIC,
  // Re-exported under a pdf-to-word-specific alias so the contract reads
  // naturally in route handlers and client islands — the value is shared
  // with pdf-extract-text / pdf-a-jpg so any cap change ripples uniformly.
  PDF_TO_WORD_FREE_MAX_BYTES,
  PDF_TO_WORD_MAX_BYTES,
};

export const FREE_MAX_UPLOAD_BYTES = PDF_TO_WORD_FREE_MAX_BYTES;
export const MAX_UPLOAD_BYTES = PDF_TO_WORD_MAX_BYTES;
export const MAX_PAGES = 30;

export const PdfToWordInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type PdfToWordInputMeta = z.infer<typeof PdfToWordInputMeta>;

export const PdfToWordFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfToWordFieldErrors = z.infer<typeof PdfToWordFieldErrors>;

export const PdfToWordServerError = z.object({
  error: z.string(),
});
export type PdfToWordServerError = z.infer<typeof PdfToWordServerError>;

// Spanish error strings — keep in lockstep with the API route handlers.
export const ERROR_NO_FILE = 'Sube un archivo PDF en el campo "file"';
export const ERROR_FILE_TOO_LARGE = `El PDF supera ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(
  0,
)} MB`;
export const ERROR_NOT_PDF = 'El archivo no es un PDF válido (cabecera incorrecta)';
export const ERROR_READ_FORM = 'No se pudo leer el formulario';
export const ERROR_PDF_PASSWORD =
  'El PDF está protegido con contraseña. Quita la contraseña antes de convertirlo a Word';
export const ERROR_PDF_EMPTY = 'El PDF no tiene páginas';
export const ERROR_PDF_CORRUPT = 'No se pudo leer el PDF — el archivo podría estar dañado';
export const ERROR_CONVERT_FAILED =
  'No se pudo convertir el PDF a Word. Inténtalo de nuevo con otro archivo';
export const ERROR_TIMEOUT = 'Conversión de PDF a Word tardó demasiado';
