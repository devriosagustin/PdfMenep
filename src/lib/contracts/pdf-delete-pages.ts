import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

// Local size cap: pdf-convert caps uploads at 20 MB, too restrictive for a
// page-deletion tool where multi-MB contracts/manuals are common. We match
// the rotate / page-numbers family (60 MB free / 180 MB PRO). The
// drift-guard test in tests/unit/pdf-delete-pages.test.ts asserts
// FREE_MAX_DELETE_PAGES_BYTES stays equal to 60 * 1024 * 1024.
export const FREE_MAX_DELETE_PAGES_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_DELETE_PAGES_BYTES = FREE_MAX_DELETE_PAGES_BYTES * PRO_SCALE; // 180 MB — PRO ceiling

export const MAX_PAGES = 100;

export const PdfDeletePageNumber = z.number().int().min(1);
export type PdfDeletePageNumber = z.infer<typeof PdfDeletePageNumber>;

// Wire envelope: the client expands its "3,5-7" range syntax into a flat
// ascending list of integers and JSON-stringifies it. The schema accepts
// THIS shape only — ranges are NOT re-interpreted on the wire. Caps:
// `.max(MAX_PAGES)` bounds the selected page count.
export const PdfDeletePagesList = z
  .string()
  .min(2)
  .max(20_000)
  .transform((raw, ctx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid_json' });
      return z.NEVER;
    }
    const r = z.array(PdfDeletePageNumber).min(1).max(MAX_PAGES).safeParse(parsed);
    if (!r.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid_shape' });
      return z.NEVER;
    }
    const seen = new Set<number>();
    for (const n of r.data) {
      if (seen.has(n)) {
        ctx.addIssue({ code: 'custom', message: 'duplicate' });
        return z.NEVER;
      }
      seen.add(n);
    }
    return r.data;
  });
export type PdfDeletePagesList = z.infer<typeof PdfDeletePagesList>;

export const PdfDeletePagesInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_DELETE_PAGES_BYTES),
});
export type PdfDeletePagesInputMeta = z.infer<typeof PdfDeletePagesInputMeta>;

export const PdfDeletePagesFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfDeletePagesFieldErrors = z.infer<typeof PdfDeletePagesFieldErrors>;

export const PdfDeletePagesServerError = z.object({
  error: z.string(),
});
export type PdfDeletePagesServerError = z.infer<typeof PdfDeletePagesServerError>;

// Spanish error strings — keep in lockstep with the API route handlers and
// the friendlyPdfsDeletePagesError() mapper. Constants stay at the top so
// the route / mapper / client island never drift.
export const ERROR_NO_FILE = 'Sube un archivo PDF en el campo "file"';
export const ERROR_NOT_PDF = 'El archivo no es un PDF válido (cabecera incorrecta)';
export const ERROR_READ_FORM = 'No se pudo leer el formulario';
export const ERROR_EMPTY_SELECTION = 'Indica al menos una página para eliminar';
export const ERROR_INVALID_PAGE_LIST =
  'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"';
export const ERROR_DUPLICATE_PAGES = 'Hay páginas repetidas en la selección';
export const ERROR_OUT_OF_RANGE = 'Alguna página está fuera del rango 1–100';
export const ERROR_TOO_MANY_PAGES = 'Selecciona como máximo 100 páginas';
export const ERROR_DELETE_FAILED =
  'No se pudo eliminar páginas. Inténtalo de nuevo con otro archivo';
