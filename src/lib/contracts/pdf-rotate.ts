import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const FREE_MAX_ROTATE_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_ROTATE_BYTES = FREE_MAX_ROTATE_BYTES * PRO_SCALE; // 180 MB — PRO ceiling
export const MAX_PAGES = 100;

// Per-page rotation enum — only 90, 180, 270 (counter-clockwise in PDF terms)
// are accepted on the wire. `sin rotar` is the client-side default and never
// reaches the server because the client's submit filter strips empty rows.
export const PdfRotationDeg = z.union([z.literal('90'), z.literal('180'), z.literal('270')]);
export type PdfRotationDeg = z.infer<typeof PdfRotationDeg>;

export const PdfRotatePageRule = z.object({
  page: z.number().int().min(1).max(MAX_PAGES),
  deg: PdfRotationDeg,
});
export type PdfRotatePageRule = z.infer<typeof PdfRotatePageRule>;

// Wire envelope for the rotation map. The client posts a JSON stringified
// array under the FormData field `rotations`; we accept a string and parse
// it server-side so the field-level caps (`min(2).max(20_000)`) cheaply
// reject malformed payloads before reaching `JSON.parse`.
export const PdfRotateRotationMap = z
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
    const r = z.array(PdfRotatePageRule).min(1).safeParse(parsed);
    if (!r.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid_shape' });
      return z.NEVER;
    }
    const seen = new Set<number>();
    for (const rule of r.data) {
      if (seen.has(rule.page)) {
        ctx.addIssue({ code: 'custom', message: 'duplicate_rotation' });
        return z.NEVER;
      }
      seen.add(rule.page);
    }
    return r.data;
  });
export type PdfRotateRotationMap = z.infer<typeof PdfRotateRotationMap>;

export const PdfRotateInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_ROTATE_BYTES),
});
export type PdfRotateInputMeta = z.infer<typeof PdfRotateInputMeta>;

export const PdfRotateFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfRotateFieldErrors = z.infer<typeof PdfRotateFieldErrors>;

export const PdfRotateServerError = z.object({
  error: z.string(),
});
export type PdfRotateServerError = z.infer<typeof PdfRotateServerError>;
