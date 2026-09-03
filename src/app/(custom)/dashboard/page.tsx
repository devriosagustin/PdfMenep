import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logoutAction } from '@/lib/actions/auth';

export const metadata: Metadata = {
  title: { absolute: 'Mi cuenta — PdfMenep' },
  description: 'Tu cuenta de PdfMenep.',
  alternates: { canonical: '/dashboard' },
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Mi cuenta</CardTitle>
          <CardDescription>{session.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Plan actual: <strong>{session.user.plan}</strong>
          </p>
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
