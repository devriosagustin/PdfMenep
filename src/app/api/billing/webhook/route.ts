import 'server-only';
import { NextResponse } from 'next/server';

import { getPreapproval, MercadoPagoError, type MpPreapprovalStatus } from '@/lib/billing/mercadopago';
import { verifyMercadoPagoSignature } from '@/lib/billing/mercadopago-signature';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MpWebhookBody {
  id?: number | string;
  type?: string;
  action?: string;
  data?: { id?: string };
}

function mapStatus(status: MpPreapprovalStatus): 'PENDING' | 'AUTHORIZED' | 'PAUSED' | 'CANCELLED' {
  switch (status) {
    case 'authorized':
      return 'AUTHORIZED';
    case 'paused':
      return 'PAUSED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

// Mercado Pago reintenta una notificación si no recibe 2xx — por eso cada
// `return` acá abajo está pensado para dejar sin marcar `processedAt` solo
// los casos en los que de verdad conviene que MP reintente más tarde.
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const dataIdFromQuery = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  const typeFromQuery = url.searchParams.get('type');

  const rawBody = await req.text();
  let body: MpWebhookBody = {};
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody) as MpWebhookBody;
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
  }

  const dataId = dataIdFromQuery ?? body.data?.id ?? null;
  const type = typeFromQuery ?? body.type ?? '';

  const signatureOk = verifyMercadoPagoSignature({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId,
  });
  if (!signatureOk) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  if (!dataId) {
    // Notificación sin id de recurso — no hay nada que procesar. 200 para
    // que Mercado Pago no la reintente indefinidamente.
    return NextResponse.json({ ok: true });
  }

  // El id que identifica la notificación en sí (para idempotencia) es el
  // `id` del body cuando viene; si no, usamos el dataId como fallback.
  const externalId = String(body.id ?? dataId);

  const already = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'mercadopago', externalId } },
  });
  if (already?.processedAt) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await prisma.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'mercadopago', externalId } },
    create: {
      provider: 'mercadopago',
      externalId,
      type,
      payload: body as object,
    },
    update: { type, payload: body as object },
  });

  const markProcessed = () =>
    prisma.webhookEvent.update({
      where: { provider_externalId: { provider: 'mercadopago', externalId } },
      data: { processedAt: new Date() },
    });

  // Solo nos importan las notificaciones de la suscripción (preapproval).
  // Las de `payment` individuales quedan registradas para idempotencia pero
  // hoy no disparan ningún cambio de plan — el estado de la preapproval ya
  // refleja si el usuario está al día.
  if (!type.includes('preapproval')) {
    await markProcessed();
    return NextResponse.json({ ok: true });
  }

  try {
    const preapproval = await getPreapproval(dataId);
    const userId = preapproval.external_reference;

    if (userId) {
      const status = mapStatus(preapproval.status);
      await prisma.$transaction([
        prisma.subscription.upsert({
          where: { userId },
          create: { userId, mpPreapprovalId: preapproval.id, status },
          update: { mpPreapprovalId: preapproval.id, status },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { plan: status === 'AUTHORIZED' ? 'PRO' : 'FREE' },
        }),
      ]);
    }

    await markProcessed();
    return NextResponse.json({ ok: true });
  } catch (err) {
    // No marcamos processedAt: si esto fue un error transitorio (Mercado
    // Pago caído, timeout, etc.) el reintento de MP lo va a procesar bien.
    const status = err instanceof MercadoPagoError ? err.status : 500;
    return NextResponse.json({ error: 'processing_failed' }, { status: status >= 500 ? 500 : 502 });
  }
}
