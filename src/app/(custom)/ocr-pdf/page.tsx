import type { Metadata } from 'next';

import { OcrPdfClient } from './ocr-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Reconocer texto de PDF (OCR) online — PdfMenep',
  },
  description:
    'Convierte un PDF escaneado o solo-imagen en un PDF con capa de texto buscable. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/ocr-pdf' },
  openGraph: {
    title: 'Reconocer texto de PDF (OCR) online — PdfMenep',
    description:
      'Convierte un PDF escaneado o solo-imagen en un PDF con capa de texto buscable. Privacidad total y sin marcas de agua.',
    type: 'website',
  },
};

export default function OcrPdfPage() {
  return <OcrPdfClient />;
}
