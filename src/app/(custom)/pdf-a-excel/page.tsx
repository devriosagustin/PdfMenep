import type { Metadata } from 'next';

import { PdfToExcelClient } from '@/components/custom/pdf-a-excel-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Conversor PDF a Excel online — PdfMenep',
  },
  description:
    'Sube un PDF y obtén un .xlsx con el texto del PDF organizado por página y fila. Conversión honesta, privada y sin marca de agua.',
  alternates: { canonical: '/pdf-a-excel' },
  openGraph: {
    title: 'Conversor PDF a Excel online — PdfMenep',
    description:
      'Convierte PDFs a Excel (.xlsx) con el texto del PDF estructurado en filas y columnas. Privacidad total, sin marcas de agua.',
    type: 'website',
  },
};

export default function PdfToExcelPage() {
  return <PdfToExcelClient />;
}
