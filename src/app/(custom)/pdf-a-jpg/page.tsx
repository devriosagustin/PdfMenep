import type { Metadata } from 'next';

import { PdfToJpgClient } from './pdf-to-jpg-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Conversor PDF a JPG — PdfMenep',
  },
  description:
    'Sube un PDF de hasta 20 MB y obtén una imagen JPG por página (o un solo JPG si tiene una página). Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/pdf-a-jpg' },
  openGraph: {
    title: 'Conversor PDF a JPG — PdfMenep',
    description: 'Convierte PDFs a JPG localmente. Privacidad total, sin marcas de agua.',
    type: 'website',
  },
};

export default function PdfToJpgPage() {
  return <PdfToJpgClient />;
}
