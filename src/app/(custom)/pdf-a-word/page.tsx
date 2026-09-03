import type { Metadata } from 'next';

import { PdfToWordClient } from '@/components/custom/pdf-a-word-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Conversor PDF a Word online — PdfMenep',
  },
  description:
    'Sube un PDF y obtén un .docx con el texto del PDF organizado por página. Conversión honesta, privada y sin marca de agua.',
  alternates: { canonical: '/pdf-a-word' },
  openGraph: {
    title: 'Conversor PDF a Word online — PdfMenep',
    description:
      'Convierte PDFs a Word (.docx) manteniendo el texto por página. Privacidad total, sin marcas de agua.',
    type: 'website',
  },
};

export default function PdfToWordPage() {
  return <PdfToWordClient />;
}
