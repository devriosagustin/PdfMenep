import type { Metadata } from 'next';

import { MarcaAguaPdfClient } from '@/components/custom/marca-de-agua-pdf-island';

export const metadata: Metadata = {
  title: {
    absolute: 'Marca de agua en PDF online — PdfMenep',
  },
  description:
    'Sube un PDF y estampa un texto o una imagen en cada página con posición, opacidad y rotación opcionales. Procesamiento 100% local, privado y sin marcas de agua adicionales.',
  alternates: { canonical: '/marca-de-agua-pdf' },
  openGraph: {
    title: 'Marca de agua en PDF online — PdfMenep',
    description:
      'Estampa un texto o una imagen en cada página de un PDF eligiendo posición, opacidad y rotación. Privacidad total y sin marcas de agua ajenas.',
    type: 'website',
  },
};

export default function MarcaAguaPdfPage() {
  return <MarcaAguaPdfClient />;
}
