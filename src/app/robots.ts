import type { MetadataRoute } from 'next';
import { robotsConfig } from '@/lib/robots-config';
import { siteUrl } from '@/lib/site';

const indexable = process.env.SEO_INDEXABLE === 'true';

export default function robots(): MetadataRoute.Robots {
  if (!indexable) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      ...(robotsConfig.disallow.length > 0 ? { disallow: robotsConfig.disallow } : {}),
      ...(robotsConfig.crawlDelay != null ? { crawlDelay: robotsConfig.crawlDelay } : {}),
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
