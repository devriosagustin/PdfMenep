import type { Metadata } from 'next';
import { HerramientasPdfGrid } from '@/components/custom/herramientas-pdf-grid';
import { herramientasPdf, totalHerramientasPdf } from '@/lib/herramientas-pdf-catalog';
import { siteUrl } from '@/lib/site';

const HUB_PATH = '/herramientas-pdf';
const HUB_URL = `${siteUrl}${HUB_PATH}`;

const title = 'Herramientas PDF — PdfMenep';
const description =
  'Catálogo completo de herramientas PDF e imágenes de PdfMenep: comprime, rota, divide, une, convierte y numera páginas. Procesamiento local, privado y gratuito.';

// JSON-LD blocks. Each is its own <script> so multiple structured-data objects
// on the same page get parsed as siblings by Google. Sanitizers guard against
// an injected `</script>` breaking the surrounding HTML tag.
const breadcrumbList = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: `${siteUrl}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Herramientas PDF',
      item: HUB_URL,
    },
  ],
};

const itemList = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  numberOfItems: totalHerramientasPdf,
  itemListElement: herramientasPdf.map((entry, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: entry.title,
    description: entry.description,
    url: `${siteUrl}${entry.href}`,
  })),
};

const serializeJsonLd = (payload: object): string =>
  JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: HUB_PATH },
  openGraph: {
    title,
    description,
    type: 'website',
    url: HUB_URL,
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
};

export default function HerramientasPdfHubPage() {
  return (
    <main className="bg-background">
      <script type="application/ld+json">{serializeJsonLd(breadcrumbList)}</script>
      <script type="application/ld+json">{serializeJsonLd(itemList)}</script>
      <section className="section">
        <div className="container-page flex flex-col gap-10">
          <header className="flex max-w-3xl flex-col gap-4">
            <p className="text-eyebrow">Catálogo</p>
            <h1 className="text-display text-balance">Herramientas PDF</h1>
            <p className="text-body-lg text-muted-foreground">{description}</p>
            <p className="text-small text-muted-foreground">
              {totalHerramientasPdf} herramientas en el catálogo.
            </p>
          </header>
          <HerramientasPdfGrid items={herramientasPdf} />
        </div>
      </section>
    </main>
  );
}
