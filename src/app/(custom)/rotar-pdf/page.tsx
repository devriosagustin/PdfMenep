import type { Metadata } from 'next';

import { RotarPdfClient } from './rotar-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Rotar páginas de PDF online — PdfMenep',
  },
  description:
    'Sube un PDF, indica el número de páginas y elige 90°, 180° o 270° por página. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/rotar-pdf' },
  openGraph: {
    title: 'Rotar páginas de PDF online — PdfMenep',
    description:
      'Rota una o varias páginas de un PDF (90°, 180° o 270°) sin instalar nada. Privacidad total y sin marcas de agua.',
    type: 'website',
  },
};

export default function RotarPdfPage() {
  return <RotarPdfClient />;
}
