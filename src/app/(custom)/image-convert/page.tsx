import type { Metadata } from 'next';

import { ImageConvertClient } from './image-convert-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Conversor de imágenes (JPG, PNG, WebP, GIF) — PdfMenep',
  },
  description:
    'Convierte imágenes entre JPG, PNG, WebP y GIF directamente desde tu navegador. Hasta 10 MB, sin marca de agua y con privacidad total.',
  alternates: { canonical: '/image-convert' },
  openGraph: {
    title: 'Conversor de imágenes — PdfMenep',
    description:
      'Convierte JPG, PNG, WebP y GIF localmente. Sin marca de agua y sin perder calidad.',
    type: 'website',
  },
};

export default function ImageConvertPage() {
  return <ImageConvertClient />;
}
