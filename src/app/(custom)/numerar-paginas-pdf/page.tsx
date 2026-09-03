import type { Metadata } from 'next';

import { NumerarPaginasPdfClient } from './numerar-paginas-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Numerar páginas de PDF online — PdfMenep',
  },
  description:
    'Sube un PDF, indica el número inicial y elige la posición (esquina / centro / arriba / abajo) para estampar en cada página. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/numerar-paginas-pdf' },
  openGraph: {
    title: 'Numerar páginas de PDF online — PdfMenep',
    description:
      'Estampa un número en cada página de un PDF eligiendo posición (6 puntos) y número inicial. Privacidad total y sin marcas de agua.',
    type: 'website',
  },
};

export default function NumerarPaginasPdfPage() {
  return <NumerarPaginasPdfClient />;
}
