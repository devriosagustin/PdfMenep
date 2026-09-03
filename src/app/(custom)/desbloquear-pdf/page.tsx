import type { Metadata } from 'next';

import { DesbloquearPdfClient } from '@/components/custom/desbloquear-pdf-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Desbloquear PDF (quitar contraseña) online — PdfMenep',
  },
  description:
    'Quita la contraseña de un PDF que ya puedes abrir. Procesamiento local y privado, sin marca de agua, descarga inmediata.',
  alternates: { canonical: '/desbloquear-pdf' },
  openGraph: {
    title: 'Desbloquear PDF online — PdfMenep',
    description:
      'Quita la contraseña a un PDF protegido en segundos. Privacidad total, sin marca de agua.',
    type: 'website',
  },
};

export default function DesbloquearPdfPage() {
  return <DesbloquearPdfClient />;
}
