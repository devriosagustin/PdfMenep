import { z } from 'zod';

import { friendlySplitError } from '@/lib/errors/friendly';

export const MAX_PDF_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_PAGES = 100;
export const MAX_FILENAME_LEN = 200;
export const PDF_MAGIC = '%PDF-';

export const PdfSplitInputMeta = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LEN),
  sizeBytes: z.number().int().positive().max(MAX_PDF_BYTES),
});

export type PdfSplitInputMeta = z.infer<typeof PdfSplitInputMeta>;

export const PageSelectionRaw = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({
    mode: z.literal('pages'),
    pagesRaw: z.string().min(1).max(2000),
  }),
]);

export type PageSelectionRaw = z.infer<typeof PageSelectionRaw>;

export const PdfSplitServerError = z.object({
  error: z.string(),
});
export type PdfSplitServerError = z.infer<typeof PdfSplitServerError>;

export const PdfSplitFieldErrors = z.object({
  errors: z.record(z.string(), z.string()),
});
export type PdfSplitFieldErrors = z.infer<typeof PdfSplitFieldErrors>;

// Parse "1,3,5-7" into an ascending unique page list. The helper is
// duplicated by both the client preview and the route handler so they
// never drift. Spanish error strings map these codes to messages.
export type ParseErrorCode = 'empty' | 'parse' | 'range' | 'duplicate' | 'order' | 'limit';

export type ParseResult = { ok: true; pages: number[] } | { ok: false; error: ParseErrorCode };

export function parsePageSelectionString(input: string, maxPages: number): ParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };

  const tokens = trimmed
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { ok: false, error: 'empty' };

  const result: number[] = [];
  const seen = new Set<number>();
  let lastEmitted = 0;
  for (const token of tokens) {
    if (token.includes('-')) {
      const sides = token.split('-');
      if (sides.length !== 2) return { ok: false, error: 'parse' };
      const aRaw = sides[0]?.trim() ?? '';
      const bRaw = sides[1]?.trim() ?? '';
      if (!/^\d+$/.test(aRaw) || !/^\d+$/.test(bRaw)) {
        return { ok: false, error: 'parse' };
      }
      const a = Number.parseInt(aRaw, 10);
      const b = Number.parseInt(bRaw, 10);
      if (a < 1 || b < 1 || a > maxPages || b > maxPages) {
        return { ok: false, error: 'range' };
      }
      if (a > b) return { ok: false, error: 'order' };
      for (let n = a; n <= b; n++) {
        if (seen.has(n)) return { ok: false, error: 'duplicate' };
        seen.add(n);
        if (n < lastEmitted) return { ok: false, error: 'order' };
        lastEmitted = n;
        result.push(n);
      }
      continue;
    }
    if (!/^\d+$/.test(token)) return { ok: false, error: 'parse' };
    const n = Number.parseInt(token, 10);
    if (n < 1 || n > maxPages) return { ok: false, error: 'range' };
    if (seen.has(n)) return { ok: false, error: 'duplicate' };
    seen.add(n);
    if (n < lastEmitted) return { ok: false, error: 'order' };
    lastEmitted = n;
    result.push(n);
  }

  if (result.length > maxPages) return { ok: false, error: 'limit' };
  return { ok: true, pages: result };
}

// Spanish error strings — dispatch into the shared mapper so the route
// handler and the client island render byte-identical copy.
export function parseErrorMessage(code: ParseErrorCode, maxPages: number): string {
  switch (code) {
    case 'empty':
      return friendlySplitError('empty_selection');
    case 'parse':
      return friendlySplitError('parse_selection');
    case 'duplicate':
      return friendlySplitError('duplicate_selection');
    case 'order':
      return friendlySplitError('order_selection');
    case 'range':
      return friendlySplitError('out_of_range_selection', { maxPages });
    case 'limit':
      return friendlySplitError('selection_limit', { maxPages });
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled ParseErrorCode: ${String(exhaustive)}`);
    }
  }
}
