import type { Metadata } from 'next';

import { WordToPdfClient } from '@/components/custom/word-a-pdf-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Conversor Word a PDF online — PdfMenep',
  },
  description:
    'Sube un DOCX (texto, sin imágenes ni tablas elaboradas) y obtén un PDF listo para descargar. Conversión rápida, privada y sin marca de agua.',
  alternates: { canonical: '/word-a-pdf' },
  openGraph: {
    title: 'Conversor Word a PDF online — PdfMenep',
    description:
      'Convierte documentos Word (.docx) en PDF localmente. Privacidad total, sin marcas de agua.',
    type: 'website',
  },
};

export default function WordToPdfPage() {
  return <WordToPdfClient />;
}
