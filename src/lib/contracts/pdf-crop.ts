import { z } from 'zod';

import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

// Local size cap: 60 MB (rotate / delete-pages / page-numbers family) — large
// enough to accept brochure PDFs but tight enough to keep the worker bounded.
export const MAX_CROP_BYTES = 60 * 1024 * 1024; // 60 MB

// Geometric cap on the user-facing dimension (mm). 2000 mm ≈ 6.5 ft, well
// past any real PDF page (PDF's MediaBox is in points, but most paper stops
// under 1500 mm). Used to reject obvious nonsense without needing the
// per-page tree to surface.
export const MAX_PDF_BOX_MM = 2000;

// One integer-field mm box — the same shape the route/business module
// works with. Server validation reuses z.int().min(0).max(MAX_PDF_BOX_MM)
// on each coordinate so the wire envelope and the per-step check stay in
// lockstep.
export const PdfCropBox = z.object({
  x: z.number().int().min(0).max(MAX_PDF_BOX_MM),
  y: z.number().int().min(0).max(MAX_PDF_BOX_MM),
  width: z.number().int().min(0).max(MAX_PDF_BOX_MM),
  height: z.number().int().min(0).max(MAX_PDF_BOX_MM),
});
export type PdfCropBox = z.infer<typeof PdfCropBox>;

// Wire envelope: the client JSON-stringifies its {x, y, width, height, origin}
// triple into a single `box` field. We accept a string and parse it
// server-side; caps `.min(2).max(20_000)` cheaply reject malformed payloads
// before reaching `JSON.parse`.
export const PdfCropBoxEnvelope = z
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
    if (!parsed || typeof parsed !== 'object') {
      ctx.addIssue({ code: 'custom', message: 'invalid_shape' });
      return z.NEVER;
    }
    const r = PdfCropBox.safeParse(parsed);
    if (!r.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid_shape' });
      return z.NEVER;
    }
    const b = r.data;
    if (b.width === 0 || b.height === 0) {
      ctx.addIssue({ code: 'custom', message: 'zero_box' });
      return z.NEVER;
    }
    if (b.x + b.width > MAX_PDF_BOX_MM || b.y + b.height > MAX_PDF_BOX_MM) {
      ctx.addIssue({ code: 'custom', message: 'out_of_range_box' });
      return z.NEVER;
    }
    return b;
  });
export type PdfCropBoxEnvelope = z.infer<typeof PdfCropBoxEnvelope>;

export const PdfCropInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_CROP_BYTES),
});
export type PdfCropInputMeta = z.infer<typeof PdfCropInputMeta>;

export const PdfCropFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfCropFieldErrors = z.infer<typeof PdfCropFieldErrors>;

export const PdfCropServerError = z.object({
  error: z.string(),
});
export type PdfCropServerError = z.infer<typeof PdfCropServerError>;

// Spanish error strings — keep in lockstep with the route handlers, the
// friendlyCropError() mapper and the client island. Constants appear at the
// top so the route / mapper / client island never drift.
export const ERROR_NO_FILE = 'Sube un archivo PDF en el campo "file"';
export const ERROR_NOT_PDF = 'El archivo no es un PDF válido (cabecera incorrecta)';
export const ERROR_READ_FORM = 'No se pudo leer el formulario';
export const ERROR_NO_BOX = 'Indica la región a recortar (x, y, ancho y alto en mm)';
export const ERROR_INVALID_BOX = 'Región de recorte inválida. Introduce números enteros en mm';
export const ERROR_OUT_OF_RANGE_BOX =
  'La región de recorte se sale de la página. Usa valores entre 0 y 2000 mm';
export const ERROR_CROP_FAILED = 'No se pudo recortar el PDF. Inténtalo de nuevo con otro archivo';
