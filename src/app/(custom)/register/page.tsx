import type { Metadata } from 'next';

import { RegisterClient } from './register-client';

export const metadata: Metadata = {
  title: { absolute: 'Crear cuenta — PdfMenep' },
  description: 'Registrate gratis en PdfMenep.',
  alternates: { canonical: '/register' },
};

export default function RegisterPage() {
  return <RegisterClient />;
}
