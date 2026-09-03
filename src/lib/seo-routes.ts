import type { MetadataRoute } from 'next';

/** App-absolute `path` (e.g. /items/aatrox) + optional Next sitemap fields. */
export type SeoRoute = { path: string } & Omit<MetadataRoute.Sitemap[number], 'url'>;

export async function seoRoutes(): Promise<SeoRoute[]> {
  return [];
}
