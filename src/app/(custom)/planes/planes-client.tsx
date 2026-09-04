'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SubscribeResponse {
  initPoint?: string;
  error?: string;
}

export function PlanesClient({
  isLoggedIn,
  isPro,
  priceArs,
}: {
  isLoggedIn: boolean;
  isPro: boolean;
  priceArs: number;
}) {
  const [pending, setPending] = useState(false);

  async function onSubscribe() {
    setPending(true);
    try {
      const res = await fetch('/api/billing/subscribe', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as SubscribeResponse;
      if (!res.ok || !data.initPoint) {
        toast.error(data.error ?? 'No se pudo iniciar la suscripción.');
        return;
      }
      window.location.href = data.initPoint;
    } catch {
      toast.error('No se pudo conectar con Mercado Pago. Probá de nuevo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Free</CardTitle>
          <CardDescription>Para uso ocasional.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-3xl font-semibold">$0</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>Todas las herramientas de conversión y edición de PDF</li>
            <li>Límites de tamaño y de páginas por archivo</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardHeader>
          <CardTitle>PRO</CardTitle>
          <CardDescription>Para uso frecuente o archivos grandes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-3xl font-semibold">
            ${priceArs.toLocaleString('es-AR')}
            <span className="text-base font-normal text-muted-foreground"> / mes</span>
          </p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>Todas las herramientas de conversión y edición de PDF</li>
            <li>Límites de tamaño y de páginas mucho más altos</li>
          </ul>
          {isPro ? (
            <Button disabled variant="secondary">
              Ya sos PRO
            </Button>
          ) : isLoggedIn ? (
            <Button onClick={onSubscribe} disabled={pending}>
              {pending ? 'Redirigiendo a Mercado Pago…' : 'Suscribirme a PRO'}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/login">Iniciar sesión para suscribirme</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
