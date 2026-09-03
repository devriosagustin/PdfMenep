import type { Metadata } from 'next';

import { PdfMergeClient } from './pdf-merge-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Unir PDFs — PdfMenep',
  },
  description:
    'Sube 2 o más PDFs y descarga un único archivo con todas las páginas, en el orden que elijas. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/pdf-merge' },
  openGraph: {
    title: 'Unir PDFs — PdfMenep',
    description:
      'Fusiona varios PDFs en uno solo, manteniendo el orden de las páginas. Privacidad total, sin marcas de agua.',
    type: 'website',
  },
};

export default function PdfMergePage() {
  return <PdfMergeClient />;
}
