import { z } from 'zod';

import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { MAX_FILENAME_LEN, PDF_MAGIC } from '@/lib/contracts/pdf-convert';

export { MAX_FILENAME_LEN, PDF_MAGIC };

export const FREE_MAX_SIGN_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_SIGN_BYTES = FREE_MAX_SIGN_BYTES * PRO_SCALE; // 180 MB — PRO ceiling
export const FREE_MAX_SIGNERS = 5;
export const MAX_SIGNERS = FREE_MAX_SIGNERS * PRO_SCALE; // PRO ceiling
export const MAX_SIGNER_NAME_LEN = 80;
export const MAX_REASON_LEN = 200;
export const MAX_LOCATION_LEN = 200;
export const MAX_PASSWORD_LEN = 64;

// One signer block: name (required) + optional reason / location / signing
// date + the user-supplied today-date fallback for the missing-date path
// (kept small so the JSON envelope stays under the FS-limit guard).
export const PdfSignSigner = z.object({
  name: z.string().min(1).max(MAX_SIGNER_NAME_LEN),
  reason: z.string().max(MAX_REASON_LEN).optional(),
  location: z.string().max(MAX_LOCATION_LEN).optional(),
  signingDate: z.boolean().optional(),
});
export type PdfSignSigner = z.infer<typeof PdfSignSigner>;

// Wire envelope — JSON-stringified array so the per-signer length caps
// (each per-signer.optional() MAX_* cap) cheaply reject malformed payloads
// on the server side without first unpacking each row.
export const PdfSignSigners = z
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
    const r = z.array(PdfSignSigner).min(1).max(MAX_SIGNERS).safeParse(parsed);
    if (!r.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid_shape' });
      return z.NEVER;
    }
    return r.data;
  });
export type PdfSignSigners = z.infer<typeof PdfSignSigners>;

// Optional password. An empty string is treated as "no password"; absent
// is also "no password supplied". Length bound mirrors /pdf/protect.
export const PdfSignPassword = z.string().min(0).max(MAX_PASSWORD_LEN).optional();
export type PdfSignPassword = z.infer<typeof PdfSignPassword>;

export const PdfSignInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_SIGN_BYTES),
});
export type PdfSignInputMeta = z.infer<typeof PdfSignInputMeta>;

export const PdfSignFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfSignFieldErrors = z.infer<typeof PdfSignFieldErrors>;

export const PdfSignServerError = z.object({
  error: z.string(),
});
export type PdfSignServerError = z.infer<typeof PdfSignServerError>;
