import { isValidElement, type ReactNode } from 'react';

// ── Q/A data — single source of truth for visible accordion + JSON-LD ──────

const landingFaqData: ReadonlyArray<{ question: string; answer: ReactNode }> = [
  {
    question: '¿Cómo comprimir un PDF sin perder calidad?',
    answer: (
      <p>
        Sube tu archivo al{' '}
        <a
          href="/comprimir-pdf"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          compresor de PDF
        </a>{' '}
        y elige el nivel de compresión que prefieras: Baja (cambios apenas visibles), Media
        (equilibrio entre peso y nitidez) o Alta (máxima reducción). El archivo se procesa en tu
        navegador, así que puedes comparar los tres niveles y descargar el que mejor conserve la
        calidad.
      </p>
    ),
  },
  {
    question: '¿Es seguro subir archivos a PdfMenep?',
    answer: (
      <p>
        Sí. Tal como explicamos en{' '}
        <a
          href="/#caracteristicas"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          la sección de Privacidad garantizada
        </a>
        , tus archivos se procesan localmente en tu navegador. Nunca suben a servidores externos, no
        se almacenan en ninguna base de datos y desaparecen al cerrar la pestaña.
      </p>
    ),
  },
  {
    question: '¿Hay límite de peso o de cantidad de archivos?',
    answer: (
      <p>
        No fijamos un tope rígido: el límite depende del rendimiento de tu navegador y de tu equipo.
        Para imágenes puedes recurrir al{' '}
        <a
          href="/comprimir-imagenes"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          compresor de imágenes por lotes
        </a>{' '}
        con control de calidad 1–100, y para combinar varios PDFs está{' '}
        <a
          href="/pdf-merge"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          unir PDFs
        </a>
        , que te entrega un único documento en el orden que elijas.
      </p>
    ),
  },
  {
    question: '¿Los PDFs se pueden procesar sin conexión?',
    answer: (
      <p>
        Sí. PdfMenep funciona como una PWA instalable: una vez instalada en tu dispositivo,
        guarda los recursos necesarios para que las conversiones sigan funcionando aunque te quedes
        sin internet. Encontrarás el manifest de la aplicación en{' '}
        <a
          href="/pwa.webmanifest"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          /pwa.webmanifest
        </a>
        .
      </p>
    ),
  },
  {
    question: '¿Puedo rotar y numerar las páginas a la vez?',
    answer: (
      <p>
        Sí, pero como dos pasos separados. Primero orienta las páginas en{' '}
        <a
          href="/rotar-pdf"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          rotar PDF
        </a>{' '}
        (90°, 180° o 270°, todas o un rango) y después añade la numeración en{' '}
        <a
          href="/numerar-paginas-pdf"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          numerar páginas
        </a>
        , eligiendo posición, tamaño y formato. El archivo resultante mantiene la orientación y la
        numeración configuradas.
      </p>
    ),
  },
  {
    question: '¿Qué pasa con mis archivos después de procesarlos?',
    answer: (
      <p>
        Nada. Como detallamos en{' '}
        <a
          href="/#caracteristicas"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700 transition-colors"
        >
          Privacidad garantizada
        </a>
        , todo el procesamiento ocurre dentro de tu navegador. Los archivos nunca llegan a nuestros
        servidores: cuando descargas el resultado, la copia temporal que vive en la memoria del
        navegador se libera al cerrar la pestaña.
      </p>
    ),
  },
];

// ── JSON-LD helpers ────────────────────────────────────────────────────────

const serializeJsonLd = (payload: object): string =>
  JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

function reactNodeToPlainText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToPlainText).join(' ');
  if (isValidElement(node)) {
    return reactNodeToPlainText((node.props as { children?: ReactNode }).children ?? '');
  }
  // Fragments, portals, etc. — best-effort: walk .props.children if it's a
  // ReactElement-ish thing; otherwise bail to empty.
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return reactNodeToPlainText(props?.children ?? '');
  }
  return '';
}

function answerPlainText(answer: ReactNode): string {
  return reactNodeToPlainText(answer).replace(/\s+/g, ' ').trim();
}

const faqPageLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: landingFaqData.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answerPlainText(answer),
    },
  })),
};

// ── Rendered section ───────────────────────────────────────────────────────

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Expandir</title>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function LandingFaq() {
  return (
    <>
      <section id="preguntas-frecuentes" className="section bg-muted/20">
        <div className="container-page">
          <header className="mb-12 max-w-3xl">
            <p className="text-eyebrow mb-3">Preguntas</p>
            <h2 className="font-display text-h2 font-bold tracking-tight text-foreground">
              Preguntas frecuentes
            </h2>
            <p className="mt-4 text-muted-foreground">
              Resolvemos las dudas más comunes sobre privacidad, límites, uso sin conexión y el
              procesamiento local de tus archivos PDF e imágenes.
            </p>
          </header>

          <div className="grid max-w-3xl gap-3">
            {landingFaqData.map(({ question, answer }) => (
              <details
                key={question}
                className="group rounded-xl border border-border/60 bg-card/60 transition-all duration-200 open:border-brand-300 hover:border-brand-300"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 group-open:text-brand-600" />
                </summary>
                <div className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                  {answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
      <script type="application/ld+json">{serializeJsonLd(faqPageLd)}</script>
    </>
  );
}
