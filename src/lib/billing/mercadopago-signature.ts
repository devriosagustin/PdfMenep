import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

// Verifica el header `x-signature` de un webhook de Mercado Pago siguiendo
// su esquema documentado: `x-signature: ts=<unix>,v1=<hmac-sha256 hex>` sobre
// un "manifest" armado con el id del recurso (query param `data.id`), el
// `x-request-id` y el `ts`. Referencia:
// https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
export interface VerifyMercadoPagoSignatureInput {
  xSignature: string | null;
  xRequestId: string | null;
  /** El `data.id` (o `id`) que viene en el query string de la URL del webhook. */
  dataId: string | null;
}

function parseSignatureHeader(header: string): { ts?: string; v1?: string } {
  const parts: Record<string, string> = {};
  for (const chunk of header.split(',')) {
    const [rawKey, ...rawVal] = chunk.split('=');
    const key = rawKey?.trim();
    const value = rawVal.join('=').trim();
    if (key && value) parts[key] = value;
  }
  return parts;
}

export function verifyMercadoPagoSignature(input: VerifyMercadoPagoSignatureInput): boolean {
  if (!input.xSignature || !input.dataId) return false;

  const { ts, v1 } = parseSignatureHeader(input.xSignature);
  if (!ts || !v1) return false;

  const manifest = `id:${input.dataId.toLowerCase()};${
    input.xRequestId ? `request-id:${input.xRequestId};` : ''
  }ts:${ts};`;

  const expectedHex = createHmac('sha256', env.MERCADOPAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  const expected = Buffer.from(expectedHex, 'utf8');
  const actual = Buffer.from(v1, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
