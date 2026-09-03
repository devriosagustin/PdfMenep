import type { Metadata } from 'next';

import { RepararPdfClient } from './reparar-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Reparar PDF online — PdfMenep',
  },
  description:
    'Recupera un PDF dañado o corrupto reescribiendo sus páginas. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/reparar-pdf' },
  openGraph: {
    title: 'Reparar PDF online — PdfMenep',
    description:
      'Recupera un PDF dañado o corrupto reescribiendo sus páginas. Privacidad total y sin marca de agua.',
    type: 'website',
  },
};

export default function RepararPdfPage() {
  return <RepararPdfClient />;
}
