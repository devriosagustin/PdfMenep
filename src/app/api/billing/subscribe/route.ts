import 'server-only';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { createProPreapproval, MercadoPagoError } from '@/lib/billing/mercadopago';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { siteName, siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SubscribeOk {
  initPoint: string;
}
interface SubscribeErr {
  error: string;
}

function errorResponse(message: string, status: number): NextResponse<SubscribeErr> {
  return NextResponse.json<SubscribeErr>({ error: message }, { status });
}

export async function POST(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return errorResponse('Necesitás iniciar sesión para suscribirte a PRO.', 401);
  }

  const existing = await prisma.subscription.findUnique({ where: { userId: session.user.id } });
  if (existing?.status === 'AUTHORIZED') {
    return errorResponse('Ya tenés una suscripción PRO activa.', 409);
  }

  try {
    const preapproval = await createProPreapproval({
      userId: session.user.id,
      email: session.user.email,
      reason: `${siteName} PRO — suscripción mensual`,
      backUrl: `${siteUrl}/dashboard`,
      priceArs: env.MERCADOPAGO_PRO_PRICE_ARS,
    });

    if (!preapproval.init_point) {
      return errorResponse('Mercado Pago no devolvió un link de pago. Probá de nuevo.', 502);
    }

    await prisma.subscription.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        mpPreapprovalId: preapproval.id,
        status: 'PENDING',
      },
      update: {
        mpPreapprovalId: preapproval.id,
        status: 'PENDING',
      },
    });

    return NextResponse.json<SubscribeOk>({ initPoint: preapproval.init_point });
  } catch (err) {
    if (err instanceof MercadoPagoError) {
      return errorResponse('Mercado Pago rechazó la solicitud. Probá de nuevo en unos minutos.', 502);
    }
    return errorResponse('No se pudo iniciar la suscripción. Probá de nuevo en unos minutos.', 500);
  }
}
