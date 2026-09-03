import type { Metadata } from 'next';

import { FirmarPdfClient } from './firmar-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Firmar PDF online — PdfMenep',
  },
  description:
    'Firma tu PDF con uno o varios firmantes añadiendo nombre, motivo, lugar y fecha. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/firmar-pdf' },
  openGraph: {
    title: 'Firmar PDF online — PdfMenep',
    description:
      'Añade firmas visibles a tu PDF con nombre, motivo, lugar y fecha. Privacidad total y sin marca de agua.',
    type: 'website',
  },
};

export default function FirmarPdfPage() {
  return <FirmarPdfClient />;
}
