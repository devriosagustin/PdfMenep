'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/lib/actions/auth';

export function LoginClient() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await loginAction({
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
      });
      if (!result.ok) setError(result.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Accedé a tu cuenta de PdfMenep.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
