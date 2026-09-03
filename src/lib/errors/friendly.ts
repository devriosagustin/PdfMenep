import {
  MAX_COMPRESS_BYTES as COMPRESS_MAX_BYTES,
  MAX_COMPRESS_FILES as COMPRESS_MAX_FILES,
} from '@/lib/contracts/image-compress-limits';
import { MAX_UPLOAD_BYTES as PDF_TO_EXCEL_MAX_BYTES } from '@/lib/contracts/pdf-a-excel';
import { MAX_UPLOAD_BYTES as PDF_TO_WORD_MAX_BYTES } from '@/lib/contracts/pdf-a-word';
import { MAX_UPLOAD_BYTES as EXTRACT_TEXT_MAX_BYTES } from '@/lib/contracts/pdf-convert';
import { MAX_CROP_BYTES } from '@/lib/contracts/pdf-crop';
import { MAX_PDFS, MAX_PER_FILE_BYTES, MAX_TOTAL_BYTES } from '@/lib/contracts/pdf-merge';
import { MAX_OCR_BYTES } from '@/lib/contracts/pdf-ocr';
import { MAX_OPTIMIZE_BYTES as OPTIMIZE_MAX_BYTES } from '@/lib/contracts/pdf-optimize';
import { MAX_PAGE_NUMBERS_BYTES } from '@/lib/contracts/pdf-page-numbers';
import { MAX_PAGES as ROTATE_MAX_PAGES } from '@/lib/contracts/pdf-rotate';
import { MAX_WATERMARK_BYTES } from '@/lib/contracts/pdf-watermark';
import { MAX_UPLOAD_BYTES as DOCX_TO_PDF_MAX_BYTES } from '@/lib/contracts/word-a-pdf';

export type PdfMergeErrorCode =
  | 'too_few_files'
  | 'too_many_files'
  | 'filename_too_long'
  | 'file_too_big'
  | 'total_too_big'
  | 'bad_magic'
  | 'read_form_failed'
  | 'invalid_pdf'
  | 'invalid_pdf_meta'
  | 'merge_failed'
  | 'timeout'
  | 'unexpected';

export function friendlyError(code: PdfMergeErrorCode, filename?: string): string {
  switch (code) {
    case 'too_few_files':
      return 'Sube al menos 2 PDFs para fusionar';
    case 'too_many_files':
      return `Máximo ${MAX_PDFS} PDFs`;
    case 'filename_too_long':
      return `El nombre de "${filename ?? ''}" es demasiado largo`;
    case 'file_too_big': {
      const mb = (MAX_PER_FILE_BYTES / (1024 * 1024)).toFixed(0);
      return `El PDF "${filename ?? ''}" supera ${mb} MB`;
    }
    case 'total_too_big': {
      const mb = (MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0);
      return `El total de los PDFs supera ${mb} MB`;
    }
    case 'bad_magic':
      return `"${filename ?? ''}" no es un PDF válido (cabecera incorrecta)`;
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'invalid_pdf':
      return filename ? `"${filename}" no se pudo leer como PDF` : 'Entrada no válida';
    case 'invalid_pdf_meta':
      return `El PDF "${filename ?? ''}" no es válido`;
    case 'merge_failed':
      return `No se pudieron copiar las páginas de "${filename ?? ''}"`;
    case 'timeout':
      return 'Fusión de PDFs tardó demasiado';
    case 'unexpected':
      return 'No se pudo fusionar los PDFs';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfMergeErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfSplitErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'empty_selection'
  | 'parse_selection'
  | 'duplicate_selection'
  | 'order_selection'
  | 'out_of_range_selection'
  | 'selection_limit'
  | 'invalid_selection_mode'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'selection_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlySplitContext {
  filename?: string;
  maxPages?: number;
  mb?: number;
}

export function friendlySplitError(
  code: PdfSplitErrorCode,
  ctx: FriendlySplitContext = {},
): string {
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big': {
      const mb = ctx.mb ?? 60;
      const file = ctx.filename ?? '';
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    }
    case 'filename_too_long':
      return `El nombre de "${ctx.filename ?? ''}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return `El PDF "${ctx.filename ?? ''}" no es válido`;
    case 'bad_magic':
      return ctx.filename
        ? `"${ctx.filename}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'empty_selection':
      return 'Indica las páginas a extraer (por ejemplo "1,3,5-7") o usa el modo "Todas"';
    case 'parse_selection':
      return 'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"';
    case 'duplicate_selection':
      return 'Hay páginas repetidas en la selección';
    case 'order_selection':
      return 'Las páginas deben estar en orden ascendente';
    case 'out_of_range_selection':
      return `Alguna página está fuera del rango 1–${ctx.maxPages ?? 100}`;
    case 'selection_limit':
      return `Selecciona como máximo ${ctx.maxPages ?? 100} páginas`;
    case 'invalid_selection_mode':
      return 'Selección de páginas no válida';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña';
    case 'invalid_pdf_corrupt':
      return 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'selection_failed':
      return 'No se pudieron copiar las páginas seleccionadas';
    case 'timeout':
      return 'División de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo dividir el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfSplitErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type ImageCompressErrorCode =
  | 'read_form_failed'
  | 'read_file_failed'
  | 'file_too_big'
  | 'filename_too_long'
  | 'no_files'
  | 'too_many_files'
  | 'invalid_quality'
  | 'bad_magic'
  | 'not_compressible'
  | 'decode_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyCompressContext {
  filename?: string;
  mb?: number;
  formatsHint?: string;
}

export function friendlyCompressError(
  code: ImageCompressErrorCode,
  ctx: FriendlyCompressContext = {},
): string {
  const name = ctx.filename ?? '';
  const formats = ctx.formatsHint ?? 'JPG, PNG ni WebP';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'read_file_failed':
      return 'No se pudo leer el archivo';
    case 'file_too_big': {
      const mb = ctx.mb ?? (COMPRESS_MAX_BYTES / (1024 * 1024)).toFixed(0);
      return `El archivo supera ${mb} MB`;
    }
    case 'filename_too_long':
      return 'El nombre del archivo es demasiado largo';
    case 'no_files':
      return 'No se subieron archivos';
    case 'too_many_files':
      return `Demasiados archivos (máximo ${COMPRESS_MAX_FILES})`;
    case 'invalid_quality':
      return 'La calidad debe estar entre 1 y 100';
    case 'bad_magic':
      return `El archivo "${name}" no es ${formats}`;
    case 'not_compressible':
      return `El archivo "${name}" no es ${formats}`;
    case 'decode_failed':
      return `No se pudo comprimir "${name}" — el archivo podría estar dañado`;
    case 'timeout':
      return 'Compresión de imágenes tardó demasiado';
    case 'unexpected':
      return 'No se pudo comprimir las imágenes';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled ImageCompressErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfRotateErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'no_rotations'
  | 'invalid_rotation_deg'
  | 'out_of_range_rotation'
  | 'duplicate_rotation'
  | 'invalid_rotation_map'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'rotate_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyRotateContext {
  filename?: string;
  maxPages?: number;
  mb?: number;
}

export function friendlyRotateError(
  code: PdfRotateErrorCode,
  ctx: FriendlyRotateContext = {},
): string {
  const maxPages = ctx.maxPages ?? ROTATE_MAX_PAGES;
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big': {
      const mb = ctx.mb ?? 60;
      const file = ctx.filename ?? '';
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    }
    case 'filename_too_long':
      return `El nombre de "${ctx.filename ?? ''}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return `El PDF "${ctx.filename ?? ''}" no es válido`;
    case 'bad_magic':
      return ctx.filename
        ? `"${ctx.filename}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'no_rotations':
      return 'Indica al menos una página para rotar';
    case 'invalid_rotation_deg':
      return 'Solo se puede rotar 90°, 180° o 270°';
    case 'out_of_range_rotation':
      return `Alguna página está fuera del rango 1–${maxPages}`;
    case 'duplicate_rotation':
      return 'Hay páginas repetidas en la selección';
    case 'invalid_rotation_map':
      return 'Selección de rotación no válida';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña';
    case 'invalid_pdf_corrupt':
      return 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'rotate_failed':
      return 'No se pudo rotar el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Rotación de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo rotar el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfRotateErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfOptimizeErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'no_level'
  | 'invalid_level'
  | 'filename_too_long'
  | 'file_too_big'
  | 'bad_magic'
  | 'invalid_pdf_meta'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'invalid_pdf_empty'
  | 'optimize_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyOptimizeContext {
  filename?: string;
  mb?: number;
}

export function friendlyOptimizeError(
  code: PdfOptimizeErrorCode,
  ctx: FriendlyOptimizeContext = {},
): string {
  const mb = ctx.mb ?? (OPTIMIZE_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'no_level':
      return 'Selecciona un nivel (Baja, Media o Alta)';
    case 'invalid_level':
      return 'Nivel de compresión inválido. Usa "Baja", "Media" o "Alta"';
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña antes de comprimirlo';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'optimize_failed':
      return 'No se pudo comprimir el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Compresión de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo comprimir el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfOptimizeErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfPageNumbersErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'no_position'
  | 'invalid_position'
  | 'no_starting_number'
  | 'invalid_starting_number'
  | 'filename_too_long'
  | 'file_too_big'
  | 'bad_magic'
  | 'invalid_pdf_meta'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'page_numbers_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyPageNumbersContext {
  filename?: string;
  mb?: number;
}

export function friendlyPageNumbersError(
  code: PdfPageNumbersErrorCode,
  ctx: FriendlyPageNumbersContext = {},
): string {
  const mb = ctx.mb ?? (MAX_PAGE_NUMBERS_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'no_position':
      return 'Selecciona la posición del número';
    case 'invalid_position':
      return 'Posición no válida';
    case 'no_starting_number':
      return 'Indica el número desde el que empezar';
    case 'invalid_starting_number':
      return 'El número de inicio debe ser un entero mayor o igual a 1';
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'page_numbers_failed':
      return 'No se pudo numerar el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Numeración de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo numerar el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfPageNumbersErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfExtractTextErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'invalid_pdf_password'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_corrupt'
  | 'extract_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyExtractTextContext {
  filename?: string;
  mb?: number;
}

export function friendlyExtractTextError(
  code: PdfExtractTextErrorCode,
  ctx: FriendlyExtractTextContext = {},
): string {
  const mb = ctx.mb ?? (EXTRACT_TEXT_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña antes de extraer el texto';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'extract_failed':
      return 'No se pudo extraer el texto del PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Extracción de texto del PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo extraer el texto del PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfExtractTextErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfToWordErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'invalid_pdf_password'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_corrupt'
  | 'convert_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyPdfToWordContext {
  filename?: string;
  mb?: number;
}

export function friendlyPdfToWordError(
  code: PdfToWordErrorCode,
  ctx: FriendlyPdfToWordContext = {},
): string {
  const mb = ctx.mb ?? (PDF_TO_WORD_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña antes de convertirlo a Word';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'convert_failed':
      return 'No se pudo convertir el PDF a Word. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Conversión de PDF a Word tardó demasiado';
    case 'unexpected':
      return 'No se pudo convertir el PDF a Word';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfToWordErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type DocxToPdfErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_docx_meta'
  | 'bad_magic'
  | 'docx_parse_failed'
  | 'docx_no_document'
  | 'docx_protected'
  | 'convert_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyDocxToPdfContext {
  filename?: string;
  mb?: number;
}

export function friendlyDocxToPdfError(
  code: DocxToPdfErrorCode,
  ctx: FriendlyDocxToPdfContext = {},
): string {
  const mb = ctx.mb ?? (DOCX_TO_PDF_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo DOCX en el campo "file"';
    case 'file_too_big':
      return file ? `El DOCX "${file}" supera ${mb} MB` : `El DOCX supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_docx_meta':
      return file ? `El DOCX "${file}" no es válido` : 'El DOCX no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un DOCX válido (cabecera incorrecta)`
        : 'El archivo no es un DOCX válido (cabecera incorrecta)';
    case 'docx_parse_failed':
      return 'No se pudo leer el DOCX — el archivo podría estar dañado o tener un formato no compatible';
    case 'docx_no_document':
      return 'El DOCX no contiene el documento principal (word/document.xml)';
    case 'docx_protected':
      return 'El DOCX está protegido con contraseña. Quita la contraseña antes de convertirlo a PDF';
    case 'convert_failed':
      return 'No se pudo convertir el DOCX a PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Conversión de DOCX a PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo convertir el DOCX a PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled DocxToPdfErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfProtectErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'no_password'
  | 'password_too_short'
  | 'password_too_long'
  | 'protect_weak_password'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'protect_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyProtectContext {
  filename?: string;
  mb?: number;
  minChars?: number;
  maxChars?: number;
}

export function friendlyProtectError(
  code: PdfProtectErrorCode,
  ctx: FriendlyProtectContext = {},
): string {
  const min = ctx.minChars ?? 4;
  const max = ctx.maxChars ?? 64;
  const mb = ctx.mb ?? 60;
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'no_password':
      return 'Indica una contraseña para proteger el PDF';
    case 'password_too_short':
      return `La contraseña debe tener al menos ${min} caracteres`;
    case 'password_too_long':
      return `La contraseña debe tener como máximo ${max} caracteres`;
    case 'protect_weak_password':
      return `La contraseña debe tener al menos ${min} caracteres`;
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF de origen está protegido con contraseña. Quita la contraseña antes de protegerlo de nuevo';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF. El archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'protect_failed':
      return 'No se pudo proteger el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Protección de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo proteger el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfProtectErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfUnlockErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'no_password'
  | 'password_too_long'
  | 'unlock_wrong_password'
  | 'unlock_pdf_not_encrypted'
  | 'unlock_encrypt_unlock_failed'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'unlock_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyUnlockContext {
  filename?: string;
  mb?: number;
  maxChars?: number;
}

export function friendlyUnlockError(
  code: PdfUnlockErrorCode,
  ctx: FriendlyUnlockContext = {},
): string {
  const max = ctx.maxChars ?? 64;
  const mb = ctx.mb ?? 60;
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'no_password':
      return 'Indica la contraseña del PDF';
    case 'password_too_long':
      return `La contraseña debe tener como máximo ${max} caracteres`;
    case 'unlock_wrong_password':
      return 'La contraseña es incorrecta — inténtalo de nuevo';
    case 'unlock_pdf_not_encrypted':
      return 'El PDF no está protegido con contraseña';
    case 'unlock_encrypt_unlock_failed':
      return 'No se pudo desbloquear el PDF';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'La contraseña es incorrecta — inténtalo de nuevo';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF. El archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'unlock_failed':
      return 'No se pudo desbloquear el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Desbloqueo de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo desbloquear el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfUnlockErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfToExcelErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'invalid_pdf_password'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_corrupt'
  | 'convert_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyPdfToExcelContext {
  filename?: string;
  mb?: number;
}

export function friendlyPdfToExcelError(
  code: PdfToExcelErrorCode,
  ctx: FriendlyPdfToExcelContext = {},
): string {
  const mb = ctx.mb ?? (PDF_TO_EXCEL_MAX_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña antes de convertirlo a Excel';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'convert_failed':
      return 'No se pudo convertir el PDF a Excel. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Conversión de PDF a Excel tardó demasiado';
    case 'unexpected':
      return 'No se pudo convertir el PDF a Excel';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfToExcelErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfDeletePagesErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'empty_selection'
  | 'invalid_page_list'
  | 'duplicate_pages'
  | 'out_of_range'
  | 'too_many_pages'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'delete_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyDeletePagesContext {
  filename?: string;
  maxPages?: number;
  mb?: number;
}

export function friendlyDeletePagesError(
  code: PdfDeletePagesErrorCode,
  ctx: FriendlyDeletePagesContext = {},
): string {
  const maxPages = ctx.maxPages ?? 100;
  const mb = ctx.mb ?? 60;
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'empty_selection':
      return 'Indica al menos una página para eliminar';
    case 'invalid_page_list':
      return 'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"';
    case 'duplicate_pages':
      return 'Hay páginas repetidas en la selección';
    case 'out_of_range':
      return `Alguna página está fuera del rango 1–${maxPages}`;
    case 'too_many_pages':
      return `Selecciona como máximo ${maxPages} páginas`;
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF — el archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'delete_failed':
      return 'No se pudo eliminar páginas. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Eliminación de páginas tardó demasiado';
    case 'unexpected':
      return 'No se pudo eliminar páginas';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfDeletePagesErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfWatermarkErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'no_mode'
  | 'invalid_mode'
  | 'no_text'
  | 'text_too_long'
  | 'no_position'
  | 'invalid_position'
  | 'no_opacity'
  | 'invalid_opacity'
  | 'no_tilt'
  | 'invalid_tilt'
  | 'no_font_size'
  | 'invalid_font_size'
  | 'image_required'
  | 'image_too_big'
  | 'invalid_image'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'watermark_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyWatermarkContext {
  filename?: string;
  mb?: number;
}

export function friendlyWatermarkError(
  code: PdfWatermarkErrorCode,
  ctx: FriendlyWatermarkContext = {},
): string {
  const mb = ctx.mb ?? (MAX_WATERMARK_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'no_mode':
      return 'Selecciona el tipo de marca de agua (Texto o Imagen)';
    case 'invalid_mode':
      return 'Tipo de marca de agua no válido';
    case 'no_text':
      return 'Indica el texto de la marca de agua';
    case 'text_too_long':
      return `El texto debe tener como máximo 80 caracteres`;
    case 'no_position':
      return 'Selecciona la posición de la marca de agua';
    case 'invalid_position':
      return 'Posición no válida';
    case 'no_opacity':
      return 'Indica la opacidad (entre 10 y 100)';
    case 'invalid_opacity':
      return 'La opacidad debe estar entre 10 y 100';
    case 'no_tilt':
      return 'Selecciona el ángulo (-45°, 0° o 45°)';
    case 'invalid_tilt':
      return 'Ángulo no válido (-45°, 0° o 45°)';
    case 'no_font_size':
      return 'Indica el tamaño de fuente (entre 8 y 72)';
    case 'invalid_font_size':
      return 'Tamaño de fuente inválido (8-72)';
    case 'image_required':
      return 'Sube una imagen PNG o JPG para la marca de agua';
    case 'image_too_big': {
      const imageMb = ctx.mb ?? 2;
      return `La imagen supera ${imageMb} MB`;
    }
    case 'invalid_image':
      return 'La imagen no es un PNG o JPG válido (cabecera incorrecta)';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF — el archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'watermark_failed':
      return 'No se pudo añadir la marca de agua. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Marca de agua tardó demasiado';
    case 'unexpected':
      return 'No se pudo añadir la marca de agua';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfWatermarkErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfCropErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'no_box'
  | 'invalid_box'
  | 'out_of_range_box'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'crop_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyCropContext {
  filename?: string;
  mb?: number;
}

export function friendlyCropError(code: PdfCropErrorCode, ctx: FriendlyCropContext = {}): string {
  const mb = ctx.mb ?? (MAX_CROP_BYTES / (1024 * 1024)).toFixed(0);
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'no_box':
      return 'Indica la región a recortar (x, y, ancho y alto en mm)';
    case 'invalid_box':
      return 'Región de recorte inválida. Introduce números enteros en mm';
    case 'out_of_range_box':
      return 'La región de recorte se sale de la página. Usa valores entre 0 y 2000 mm';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF — el archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'crop_failed':
      return 'No se pudo recortar el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Recorte de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo recortar el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfCropErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfOcrErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'no_language'
  | 'invalid_language'
  | 'invalid_pages'
  | 'too_many_pages_selected'
  | 'out_of_range_pages'
  | 'over_page_limit'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'ocr_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyOcrContext {
  filename?: string;
  mb?: number;
  maxPages?: number;
}

export function friendlyOcrError(code: PdfOcrErrorCode, ctx: FriendlyOcrContext = {}): string {
  const mb = ctx.mb ?? (MAX_OCR_BYTES / (1024 * 1024)).toFixed(0);
  const maxPages = ctx.maxPages ?? 30;
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'no_language':
      return 'Selecciona el idioma del texto (Español o Inglés)';
    case 'invalid_language':
      return 'Idioma no válido. Usa "Español" o "Inglés"';
    case 'invalid_pages':
      return 'Selección de páginas no válida. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"';
    case 'too_many_pages_selected':
      return `Selecciona como máximo ${maxPages} páginas`;
    case 'out_of_range_pages':
      return `Alguna página está fuera del rango 1–${maxPages}`;
    case 'over_page_limit':
      return `El PDF supera el límite de ${maxPages} páginas para OCR`;
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña antes de reconocerlo';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF — el archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'ocr_failed':
      return 'No se pudo reconocer el texto del PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Reconocimiento OCR del PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo reconocer el texto del PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfOcrErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfRepairErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'password_too_long'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_password'
  | 'invalid_pdf_corrupt'
  | 'repair_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlyRepairContext {
  filename?: string;
  mb?: number;
  maxChars?: number;
}

export function friendlyRepairError(
  code: PdfRepairErrorCode,
  ctx: FriendlyRepairContext = {},
): string {
  const maxChars = ctx.maxChars ?? 64;
  const mb = ctx.mb ?? 60;
  const file = ctx.filename ?? '';
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'password_too_long':
      return `La contraseña debe tener como máximo ${maxChars} caracteres`;
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña para repararlo';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF — el archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'repair_failed':
      return 'No se pudo reparar el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Reparación de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo reparar el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfRepairErrorCode: ${String(exhaustive)}`);
    }
  }
}

export type PdfSignErrorCode =
  | 'read_form_failed'
  | 'no_file'
  | 'file_too_big'
  | 'filename_too_long'
  | 'invalid_pdf_meta'
  | 'bad_magic'
  | 'invalid_signers'
  | 'signer_too_long'
  | 'reason_too_long'
  | 'location_too_long'
  | 'too_many_signers'
  | 'password_too_long'
  | 'invalid_pdf_password'
  | 'invalid_pdf_empty'
  | 'invalid_pdf_corrupt'
  | 'sign_failed'
  | 'timeout'
  | 'unexpected';

export interface FriendlySignContext {
  filename?: string;
  mb?: number;
  maxChars?: number;
  maxSignerName?: number;
  maxReason?: number;
  maxLocation?: number;
}

export function friendlySignError(code: PdfSignErrorCode, ctx: FriendlySignContext = {}): string {
  const maxChars = ctx.maxChars ?? 64;
  const mb = ctx.mb ?? 60;
  const file = ctx.filename ?? '';
  const maxName = ctx.maxSignerName ?? 80;
  const maxReason = ctx.maxReason ?? 200;
  const maxLocation = ctx.maxLocation ?? 200;
  switch (code) {
    case 'read_form_failed':
      return 'No se pudo leer el formulario';
    case 'no_file':
      return 'Sube un archivo PDF en el campo "file"';
    case 'file_too_big':
      return file ? `El PDF "${file}" supera ${mb} MB` : `El PDF supera ${mb} MB`;
    case 'filename_too_long':
      return `El nombre de "${file}" es demasiado largo`;
    case 'invalid_pdf_meta':
      return file ? `El PDF "${file}" no es válido` : 'El PDF no es válido';
    case 'bad_magic':
      return file
        ? `"${file}" no es un PDF válido (cabecera incorrecta)`
        : 'El archivo no es un PDF válido (cabecera incorrecta)';
    case 'invalid_signers':
      return 'Indica al menos un firmante con su nombre';
    case 'signer_too_long':
      return `El nombre del firmante debe tener como máximo ${maxName} caracteres`;
    case 'reason_too_long':
      return `El motivo debe tener como máximo ${maxReason} caracteres`;
    case 'location_too_long':
      return `El lugar debe tener como máximo ${maxLocation} caracteres`;
    case 'too_many_signers':
      return 'Demasiados firmantes (máximo 5)';
    case 'password_too_long':
      return `La contraseña debe tener como máximo ${maxChars} caracteres`;
    case 'invalid_pdf_password':
      return 'El PDF está protegido con contraseña. Quita la contraseña antes de firmarlo';
    case 'invalid_pdf_empty':
      return 'El PDF no tiene páginas';
    case 'invalid_pdf_corrupt':
      return file
        ? `"${file}" no se pudo leer como PDF — el archivo podría estar dañado`
        : 'No se pudo leer el PDF — el archivo podría estar dañado';
    case 'sign_failed':
      return 'No se pudo firmar el PDF. Inténtalo de nuevo con otro archivo';
    case 'timeout':
      return 'Firma de PDF tardó demasiado';
    case 'unexpected':
      return 'No se pudo firmar el PDF';
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled PdfSignErrorCode: ${String(exhaustive)}`);
    }
  }
}
