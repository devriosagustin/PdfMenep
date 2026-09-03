import type { Metadata } from 'next';

import { ProtegerPdfClient } from '@/components/custom/proteger-pdf-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Proteger PDF con contraseña online — PdfMenep',
  },
  description:
    'Añade una contraseña a tu PDF para que solo quien la conozca pueda abrirlo. Cifrado AES estándar PDF, procesamiento local y privado, sin marca de agua.',
  alternates: { canonical: '/proteger-pdf' },
  openGraph: {
    title: 'Proteger PDF con contraseña online — PdfMenep',
    description:
      'Añade una contraseña a un PDF en segundos. Privacidad total y cifrado estándar PDF compatible con Acrobat, Preview y Chrome.',
    type: 'website',
  },
};

export default function ProtegerPdfPage() {
  return <ProtegerPdfClient />;
}
