import { z } from 'zod';

import { MAX_FILENAME_LEN } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN };

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" ZIP signature

export function isDocxMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < DOCX_MAGIC.length) return false;
  for (let i = 0; i < DOCX_MAGIC.length; i++) {
    if (bytes[i] !== DOCX_MAGIC[i]) return false;
  }
  return true;
}

export const DocxToPdfInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type DocxToPdfInputMeta = z.infer<typeof DocxToPdfInputMeta>;

export const DocxToPdfFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type DocxToPdfFieldErrors = z.infer<typeof DocxToPdfFieldErrors>;

export const DocxToPdfServerError = z.object({
  error: z.string(),
});
export type DocxToPdfServerError = z.infer<typeof DocxToPdfServerError>;

// Spanish error strings — keep in lockstep with the API route handlers.
export const ERROR_NO_FILE = 'Sube un archivo DOCX en el campo "file"';
export const ERROR_FILE_TOO_LARGE = `El DOCX supera ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(
  0,
)} MB`;
export const ERROR_NOT_DOCX = 'El archivo no es un DOCX válido (cabecera incorrecta)';
export const ERROR_READ_FORM = 'No se pudo leer el formulario';
export const ERROR_DOCX_PROTECTED =
  'El DOCX está protegido con contraseña. Quita la contraseña antes de convertirlo a PDF';
export const ERROR_DOCX_PARSE_FAILED =
  'No se pudo leer el DOCX — el archivo podría estar dañado o tener un formato no compatible';
export const ERROR_DOCX_NO_DOCUMENT =
  'El DOCX no contiene el documento principal (word/document.xml)';
export const ERROR_CONVERT_FAILED =
  'No se pudo convertir el DOCX a PDF. Inténtalo de nuevo con otro archivo';
export const ERROR_TIMEOUT = 'Conversión de DOCX a PDF tardó demasiado';
