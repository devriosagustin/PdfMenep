export const siteName = 'PdfMenep';
export const siteDescription =
  'Transforma archivos sin límites ni complicaciones. Convierte entre formatos, manipula PDFs y procesa imágenes de forma rápida y segura.';

// PWA + social-share colors. HEX only (the oklch() tokens in globals.css aren't
// readable here) — set to match your brand seed.
export const brandVisual = {
  /** PWA browser-UI / status-bar color. */
  themeColor: '#d97706',
  /** PWA splash + install background. */
  backgroundColor: '#ffffff',
  /** Social-share (OG/Twitter) image. */
  og: {
    background: '#1c1917',
    foreground: '#ffffff',
    /** Second line under the site name; '' hides it. */
    tagline: 'Transforma archivos sin límites ni complicaciones',
  },
} as const;
