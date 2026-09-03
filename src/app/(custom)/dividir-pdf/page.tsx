import type { Metadata } from 'next';

import { DividirPdfClient } from './dividir-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Dividir PDF / Extraer páginas — PdfMenep',
  },
  description:
    'Sube un PDF y extrae páginas concretas ("1,3,5-7") o todas las páginas en un nuevo PDF. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/dividir-pdf' },
  openGraph: {
    title: 'Dividir PDF / Extraer páginas — PdfMenep',
    description:
      'Extrae las páginas que quieras de un PDF y descarga el resultado en un nuevo archivo.',
    type: 'website',
  },
};

export default function DividirPdfPage() {
  return <DividirPdfClient />;
}
