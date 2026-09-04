import 'server-only';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { cancelPreapproval, MercadoPagoError } from '@/lib/billing/mercadopago';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorResponse(message: string, status: number): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('Necesitás iniciar sesión.', 401);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });
  if (!subscription || subscription.status === 'CANCELLED') {
    return errorResponse('No tenés una suscripción activa para cancelar.', 404);
  }

  try {
    await cancelPreapproval(subscription.mpPreapprovalId);
  } catch (err) {
    if (err instanceof MercadoPagoError && err.status === 404) {
      // Ya no existe del lado de Mercado Pago (por ejemplo, se canceló desde
      // la app de MP) — igual la marcamos cancelada localmente.
    } else {
      return errorResponse('No se pudo cancelar en Mercado Pago. Probá de nuevo.', 502);
    }
  }

  await prisma.$transaction([
    prisma.subscription.update({
      where: { userId: session.user.id },
      data: { status: 'CANCELLED' },
    }),
    prisma.user.update({ where: { id: session.user.id }, data: { plan: 'FREE' } }),
  ]);

  return NextResponse.json({ ok: true });
}
