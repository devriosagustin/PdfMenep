import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logoutAction } from '@/lib/actions/auth';
import { prisma } from '@/lib/db';
import { CancelSubscriptionButton } from './cancel-subscription-button';

export const metadata: Metadata = {
  title: { absolute: 'Mi cuenta — PdfMenep' },
  description: 'Tu cuenta de PdfMenep.',
  alternates: { canonical: '/dashboard' },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Plan y estado de suscripción se leen frescos de la base (no del JWT de
  // sesión) para que esta pantalla siempre refleje lo último que dijo el
  // webhook de Mercado Pago, aunque la sesión sea vieja.
  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true } }),
    prisma.subscription.findUnique({ where: { userId: session.user.id } }),
  ]);
  const plan = user?.plan ?? 'FREE';

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Mi cuenta</CardTitle>
          <CardDescription>{session.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Plan actual: <strong>{plan}</strong>
            {subscription?.status === 'PENDING' && ' — pago pendiente de confirmación'}
            {subscription?.status === 'PAUSED' && ' — suscripción pausada por Mercado Pago'}
          </p>
          {plan === 'PRO' && subscription?.status === 'AUTHORIZED' ? (
            <CancelSubscriptionButton />
          ) : (
            <Button asChild>
              <Link href="/planes">Suscribirme a PRO</Link>
            </Button>
          )}
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
