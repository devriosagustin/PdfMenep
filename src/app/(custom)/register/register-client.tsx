'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signupAction } from '@/lib/actions/auth';

export function RegisterClient() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await signupAction({
        name: String(formData.get('name') ?? ''),
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
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Registrate gratis en PdfMenep.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" type="text" required autoComplete="name" />
            </div>
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
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
