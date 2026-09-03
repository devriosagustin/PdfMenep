import type { Metadata } from 'next';

import { JpgToPdfClient } from './jpg-to-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Conversor JPG a PDF — PdfMenep',
  },
  description:
    'Sube hasta 30 imágenes JPG y obtén un PDF con una imagen por página, en el orden que elijas. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/jpg-a-pdf' },
  openGraph: {
    title: 'Conversor JPG a PDF — PdfMenep',
    description:
      'Convierte JPGs a PDF localmente, una imagen por página. Privacidad total, sin marcas de agua.',
    type: 'website',
  },
};

export default function JpgToPdfPage() {
  return <JpgToPdfClient />;
}
