export type NavGroup = 'primary' | 'secondary' | 'footer';

export type Segment = 'pymes' | 'freelancers' | 'creadores';

export interface NavItem {
  /** Visible link text. */
  label: string;
  /** App route, e.g. '/' or '/dashboard'. */
  href: string;
  /** Where it renders: top-nav 'primary'/'secondary', or 'footer'. */
  group: NavGroup;
  /** Group `primary` items into a dropdown: items sharing a `menu` value collapse
   *  into one "<menu> ⌄" top-bar slot (e.g. `menu: 'Resources'` on Blog/Docs/
   *  Changelog). Keeps the bar short. Ignored for 'secondary'/'footer'. */
  menu?: string;
  /** When true, render only if a session exists (see site-nav.tsx). */
  requiresAuth?: boolean;
  /** Sort key within a group (ascending); unordered items fall to the end. */
  order?: number;
  /** Optional segment annotation for segment-aware routing. */
  meta?: { segment?: Segment };
}

// Keep the bar short: ~3-5 primary slots, group the tail with `menu`, push the
// rest to 'footer' (SiteNav overflows extras into a "More" dropdown). Example:
//   { label: 'Pricing', href: '/pricing', group: 'primary' },
//   { label: 'Blog',    href: '/blog',    group: 'primary', menu: 'Resources' },
//   { label: 'Docs',    href: '/docs',    group: 'primary', menu: 'Resources' },
//   { label: 'Sign in', href: '/login',   group: 'secondary' },
export const navItems: NavItem[] = [
  { label: 'Características', href: '/#caracteristicas', group: 'primary', order: 1 },
  { label: 'Cómo funciona', href: '/#como-funciona', group: 'primary', order: 2 },
  {
    label: 'PDF a JPG',
    href: '/pdf-a-jpg',
    group: 'primary',
    order: 3,
    menu: 'Conversores',
    meta: { segment: 'creadores' },
  },
  {
    label: 'JPG a PDF',
    href: '/jpg-a-pdf',
    group: 'primary',
    order: 4,
    menu: 'Conversores',
    meta: { segment: 'freelancers' },
  },
  {
    label: 'Unir PDFs',
    href: '/pdf-merge',
    group: 'primary',
    order: 5,
    menu: 'Conversores',
    meta: { segment: 'pymes' },
  },
  {
    label: 'Conversor de imágenes',
    href: '/image-convert',
    group: 'primary',
    order: 6,
    menu: 'Conversores',
  },
  {
    label: 'Comprimir imágenes',
    href: '/comprimir-imagenes',
    group: 'primary',
    order: 7,
    menu: 'Conversores',
  },
  { label: 'Dividir PDF', href: '/dividir-pdf', group: 'primary', order: 8, menu: 'Conversores' },
  { label: 'Rotar PDF', href: '/rotar-pdf', group: 'primary', order: 9, menu: 'Conversores' },
  {
    label: 'Comprimir PDF',
    href: '/comprimir-pdf',
    group: 'primary',
    order: 10,
    menu: 'Conversores',
  },
  {
    label: 'Numerar páginas',
    href: '/numerar-paginas-pdf',
    group: 'primary',
    order: 11,
    menu: 'Conversores',
  },
  { label: 'Inicio', href: '/', group: 'primary', order: 0 },
  {
    label: 'Herramientas PDF',
    href: '/herramientas-pdf',
    group: 'primary',
    order: 12,
    menu: 'Conversores',
  },
  {
    label: 'Extraer texto',
    href: '/extraer-texto-pdf',
    group: 'primary',
    order: 13,
    menu: 'Conversores',
  },
  {
    label: 'PDF a Word',
    href: '/pdf-a-word',
    group: 'primary',
    order: 14,
    menu: 'Conversores',
  },
  {
    label: 'Word a PDF',
    href: '/word-a-pdf',
    group: 'primary',
    order: 15,
    menu: 'Conversores',
  },
  {
    label: 'Proteger PDF',
    href: '/proteger-pdf',
    group: 'primary',
    order: 16,
    menu: 'Conversores',
  },
  {
    label: 'Desbloquear PDF',
    href: '/desbloquear-pdf',
    group: 'primary',
    order: 17,
    menu: 'Conversores',
  },
  {
    label: 'PDF a Excel',
    href: '/pdf-a-excel',
    group: 'primary',
    order: 18,
    menu: 'Conversores',
  },
  {
    label: 'Eliminar páginas',
    href: '/eliminar-paginas-pdf',
    group: 'primary',
    order: 19,
    menu: 'Conversores',
  },
  {
    label: 'Marca de agua',
    href: '/marca-de-agua-pdf',
    group: 'primary',
    order: 20,
    menu: 'Conversores',
  },
  {
    label: 'Recortar PDF',
    href: '/recortar-pdf',
    group: 'primary',
    order: 21,
    menu: 'Conversores',
  },
  {
    label: 'OCR PDF',
    href: '/ocr-pdf',
    group: 'primary',
    order: 22,
    menu: 'Conversores',
  },
  {
    label: 'Reparar PDF',
    href: '/reparar-pdf',
    group: 'primary',
    order: 23,
    menu: 'Conversores',
  },
  {
    label: 'Firmar PDF',
    href: '/firmar-pdf',
    group: 'primary',
    order: 24,
    menu: 'Conversores',
  },
];
