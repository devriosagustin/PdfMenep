import type { Metadata } from 'next';

import { LoginClient } from './login-client';

export const metadata: Metadata = {
  title: { absolute: 'Iniciar sesión — PdfMenep' },
  description: 'Accedé a tu cuenta de PdfMenep.',
  alternates: { canonical: '/login' },
};

export default function LoginPage() {
  return <LoginClient />;
}
