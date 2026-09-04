'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export function CancelSubscriptionButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onCancel() {
    setPending(true);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'No se pudo cancelar la suscripción.');
        return;
      }
      toast.success('Suscripción PRO cancelada.');
      router.refresh();
    } catch {
      toast.error('No se pudo conectar con el servidor. Probá de nuevo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={onCancel} disabled={pending}>
      {pending ? 'Cancelando…' : 'Cancelar suscripción PRO'}
    </Button>
  );
}
