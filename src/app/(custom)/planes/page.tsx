import type { Metadata } from 'next';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { PlanesClient } from './planes-client';

export const metadata: Metadata = {
  title: { absolute: 'Planes — PdfMenep' },
  description: 'Elegí el plan de PdfMenep que se ajuste a lo que necesitás convertir.',
  alternates: { canonical: '/planes' },
  openGraph: {
    title: 'Planes — PdfMenep',
    description: 'Elegí el plan de PdfMenep que se ajuste a lo que necesitás convertir.',
    type: 'website',
  },
};

export default async function PlanesPage() {
  const session = await auth();
  let isPro = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    isPro = user?.plan === 'PRO';
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Planes</h1>
        <p className="text-muted-foreground">
          Convertí y editá PDFs sin límites de tamaño con PdfMenep PRO.
        </p>
      </div>
      <PlanesClient
        isLoggedIn={Boolean(session?.user)}
        isPro={isPro}
        priceArs={env.MERCADOPAGO_PRO_PRICE_ARS}
      />
    </main>
  );
}
