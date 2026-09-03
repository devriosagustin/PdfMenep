export interface HerramientaPdf {
  /** Stable React key — unique even when two entries share an href. */
  key: string;
  /** App route, e.g. '/comprimir-pdf'. */
  href: string;
  /** Visible card title (Spanish). */
  title: string;
  /** One-line Spanish description of what the tool does. */
  description: string;
}

export const herramientasPdf: readonly HerramientaPdf[] = [
  {
    key: 'comprimir-pdf',
    href: '/comprimir-pdf',
    title: 'Comprimir PDF',
    description: 'Reduce el peso de un PDF con niveles Baja, Media y Alta.',
  },
  {
    key: 'optimizar-pdf',
    href: '/comprimir-pdf',
    title: 'Optimizar PDF',
    description: 'Re-optimiza el PDF ya generado para máxima compresión sin perder calidad.',
  },
  {
    key: 'rotar-pdf',
    href: '/rotar-pdf',
    title: 'Rotar PDF',
    description: 'Rota todas las páginas o un rango específico en 90°, 180° o 270°.',
  },
  {
    key: 'dividir-pdf',
    href: '/dividir-pdf',
    title: 'Dividir PDF',
    description: 'Extrae un rango de páginas o divide cada página en un PDF independiente.',
  },
  {
    key: 'unir-pdfs',
    href: '/pdf-merge',
    title: 'Unir PDFs',
    description: 'Combina varios PDFs en un único documento en el orden que elijas.',
  },
  {
    key: 'jpg-a-pdf',
    href: '/jpg-a-pdf',
    title: 'JPG a PDF',
    description: 'Convierte imágenes JPG en un PDF multipágina, sin marca de agua.',
  },
  {
    key: 'pdf-a-jpg',
    href: '/pdf-a-jpg',
    title: 'PDF a JPG',
    description: 'Convierte cada página de un PDF en una imagen JPG descargable en ZIP.',
  },
  {
    key: 'numerar-paginas',
    href: '/numerar-paginas-pdf',
    title: 'Numerar páginas',
    description: 'Añade numeración a las páginas con posición, tamaño y formato configurables.',
  },
  {
    key: 'pdf-a-word',
    href: '/pdf-a-word',
    title: 'PDF a Word',
    description: 'Convierte un PDF a un .docx con el texto organizado por página.',
  },
  {
    key: 'word-a-pdf',
    href: '/word-a-pdf',
    title: 'Word a PDF',
    description: 'Convierte un .docx (texto) en un PDF listo para descargar.',
  },
  {
    key: 'comprimir-imagenes',
    href: '/comprimir-imagenes',
    title: 'Comprimir imágenes',
    description: 'Comprime JPG, PNG y WebP en lote con control de calidad 1–100 y ZIP final.',
  },
  {
    key: 'proteger-pdf',
    href: '/proteger-pdf',
    title: 'Proteger PDF con contraseña',
    description:
      'Añade una contraseña a un PDF para restringir su apertura (cifrado estándar PDF).',
  },
  {
    key: 'desbloquear-pdf',
    href: '/desbloquear-pdf',
    title: 'Desbloquear PDF',
    description: 'Quita la contraseña de un PDF que ya puedes abrir.',
  },
  {
    key: 'pdf-a-excel',
    href: '/pdf-a-excel',
    title: 'PDF a Excel',
    description: 'Extrae el texto y las filas de tablas de un PDF a un .xlsx editable.',
  },
  {
    key: 'marca-de-agua',
    href: '/marca-de-agua-pdf',
    title: 'Marca de agua PDF',
    description:
      'Estampa un texto o una imagen sobre cada página con posición, opacidad y rotación opcionales.',
  },
];

export const totalHerramientasPdf = herramientasPdf.length;
