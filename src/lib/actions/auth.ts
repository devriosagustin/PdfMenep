'use server';
import { z } from 'zod';

import { signIn, signOut } from '@/auth';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  name: z.string().trim().min(1).max(60),
});

export type AuthActionResult = { ok: true } | { ok: false; error: string };

function isCredentialsError(err: unknown): boolean {
  return (
    err instanceof Error && 'type' in err && (err as { type?: string }).type === 'CredentialsSignin'
  );
}

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const parsed = credentialsSchema.pick({ email: true, password: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Email o contraseña inválidos.' };

  try {
    await signIn('credentials', { ...parsed.data, redirectTo: '/dashboard' });
    return { ok: true };
  } catch (err) {
    if (isCredentialsError(err)) return { ok: false, error: 'Email o contraseña incorrectos.' };
    throw err;
  }
}

export async function signupAction(input: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthActionResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos de registro inválidos.' };

  const { email, password, name } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: 'Ya existe una cuenta con ese email.' };

  await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), name, plan: 'FREE' },
  });

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' });
    return { ok: true };
  } catch (err) {
    if (isCredentialsError(err)) return { ok: true };
    throw err;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
