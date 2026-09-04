import 'server-only';

import { env } from '@/lib/env';

// Cliente mínimo de la API REST de Mercado Pago hecho con `fetch` nativo —
// el repo evita sumar dependencias nuevas cuando no son indispensables (ver
// el mismo criterio en src/lib/business/word-a-pdf.ts), y el subset de la
// API de "preapproval" (suscripciones) que usamos es chico y estable.
const MP_API_BASE = 'https://api.mercadopago.com';

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

async function mpFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${MP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    throw new MercadoPagoError(`Mercado Pago respondió ${res.status} en ${path}`, res.status, json);
  }
  return json as T;
}

export type MpPreapprovalStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface MpPreapproval {
  id: string;
  status: MpPreapprovalStatus;
  init_point?: string;
  external_reference?: string | null;
  payer_id?: number;
  auto_recurring?: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
  };
  next_payment_date?: string | null;
  date_created?: string;
}

export async function createProPreapproval(input: {
  userId: string;
  email: string;
  reason: string;
  backUrl: string;
  priceArs: number;
}): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: input.reason,
      // external_reference es lo único que nos deja atar la suscripción de
      // Mercado Pago a nuestro userId — el webhook lo vuelve a leer.
      external_reference: input.userId,
      payer_email: input.email,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.priceArs,
        currency_id: 'ARS',
      },
      status: 'pending',
    }),
  });
}

export async function getPreapproval(id: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function cancelPreapproval(id: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}
