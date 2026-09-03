import type { Metadata } from 'next';

import { RecortarPdfClient } from './recortar-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Recortar páginas de PDF online — PdfMenep',
  },
  description:
    'Recorta una región de cada página de un PDF indicando x, y, ancho y alto en milímetros. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/recortar-pdf' },
  openGraph: {
    title: 'Recortar páginas de PDF online — PdfMenep',
    description:
      'Recorta una región rectangular de cada página de un PDF (x, y, ancho y alto en mm). Privacidad total y sin marcas de agua.',
    type: 'website',
  },
};

export default function RecortarPdfPage() {
  return <RecortarPdfClient />;
}
