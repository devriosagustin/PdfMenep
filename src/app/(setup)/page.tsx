import type { Metadata } from 'next';
import { LandingFaq } from '@/components/custom/landing-faq';
import { siteDescription, siteName } from '@/lib/site';
import { LandingContent } from './landing-client';

// Keep this a Server Component so it can export metadata.
export const metadata: Metadata = {
  title: { absolute: siteName },
  description: siteDescription,
  // Do not export an explicit openGraph object here; that suppresses the
  // file-based opengraph-image.tsx for the home route.
  alternates: { canonical: '/' },
};

export default function SetupPlaceholder() {
  return (
    <>
      <LandingContent />
      <LandingFaq />
    </>
  );
}
