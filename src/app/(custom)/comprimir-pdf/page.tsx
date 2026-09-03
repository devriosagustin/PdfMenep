import type { Metadata } from 'next';

import { ComprimirPdfClient } from './comprimir-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Comprimir PDF online — PdfMenep',
  },
  description:
    'Reduce el peso de un PDF eligiendo un nivel (Baja, Media o Alta). Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/comprimir-pdf' },
  openGraph: {
    title: 'Comprimir PDF online — PdfMenep',
    description:
      'Reduce el peso de un PDF eligiendo un nivel (Baja, Media o Alta). Procesamiento 100% local, privado y sin marca de agua.',
    type: 'website',
  },
};

export default function ComprimirPdfPage() {
  return <ComprimirPdfClient />;
}
