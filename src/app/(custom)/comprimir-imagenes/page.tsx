import type { Metadata } from 'next';

import { ImageCompressClient } from './image-compress-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Comprimir imágenes (JPG, PNG, WebP) — PdfMenep',
  },
  description:
    'Comprime imágenes JPG, PNG y WebP desde tu navegador. Hasta 20 archivos de 10 MB, elige la calidad (1–100) y descarga todo en un ZIP con tabla de ahorro. Sin marca de agua.',
  alternates: { canonical: '/comprimir-imagenes' },
  openGraph: {
    title: 'Comprimir imágenes — PdfMenep',
    description:
      'Comprime JPG, PNG y WebP a granel sin perder calidad visible. Descarga directa en ZIP.',
    type: 'website',
  },
};

export default function ImageCompressPage() {
  return <ImageCompressClient />;
}
