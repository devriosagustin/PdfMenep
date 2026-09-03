import type { Metadata } from 'next';

import { ExtraerTextoPdfClient } from '@/components/custom/extraer-texto-pdf-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Extraer texto de PDF online — PdfMenep',
  },
  description:
    'Sube un PDF y obtén todo su texto en un .txt con cada página separada por salto de página. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/extraer-texto-pdf' },
  openGraph: {
    title: 'Extraer texto de PDF online — PdfMenep',
    description:
      'Convierte el contenido de un PDF a texto plano (.txt) con cada página separada por un salto de página. Privacidad total y sin marcas de agua.',
    type: 'website',
  },
};

export default function ExtraerTextoPdfPage() {
  return <ExtraerTextoPdfClient />;
}
