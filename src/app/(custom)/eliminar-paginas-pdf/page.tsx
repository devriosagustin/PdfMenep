import type { Metadata } from 'next';

import { EliminarPaginasPdfClient } from './eliminar-paginas-pdf-client';

export const metadata: Metadata = {
  title: {
    absolute: 'Eliminar páginas de PDF online — PdfMenep',
  },
  description:
    'Sube un PDF, indica las páginas que quieres quitar (por ejemplo "3,5-7") y descarga el PDF sin esas páginas. Procesamiento 100% local, privado y sin marca de agua.',
  alternates: { canonical: '/eliminar-paginas-pdf' },
  openGraph: {
    title: 'Eliminar páginas de PDF online — PdfMenep',
    description:
      'Quita páginas de un PDF indicando números o rangos (por ejemplo "3,5-7"). Privacidad total y sin marcas de agua.',
    type: 'website',
  },
};

export default function EliminarPaginasPdfPage() {
  return <EliminarPaginasPdfClient />;
}
