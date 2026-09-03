import type { NextConfig } from 'next';

type RemotePatterns = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>;

/** Remote hosts you load <Image> from. e.g. { protocol: 'https', hostname: 'images.unsplash.com' } */
export const userRemotePatterns: RemotePatterns = [];

/** Package-level Next options (transpilePackages, experimental.optimizePackageImports, …). */
export const userNextConfig: NextConfig = {
  // Keep the canvas native binding + the legacy CommonJS zip helper out of
  // Turbopack's ESM chunks — they ship as prebuilt binaries / CJS and must be
  // required by Node at runtime. pdfjs-dist is ESM and our route handler loads
  // it via createRequire without bundling artifacts, so it stays bundlable.
  serverExternalPackages: ['@napi-rs/canvas', 'jszip'],
};

/**
 * Browser features the app needs (microphone / camera / geolocation / …).
 * True emits `<feature>=(self)` — the browser's own permission prompt is still
 * the gate. Default is OFF: with all three off, getUserMedia / geolocation
 * silently never start. Add only the features you actually use; audits flag
 * unused device permissions.
 */
export const appCapabilities: {
  camera?: boolean;
  microphone?: boolean;
  geolocation?: boolean;
} = {};

/**
 * Per-app CSP source allow-lists for resource directives (frame-src,
 * connect-src, media-src, font-src, img-src). Empty by default — same-origin
 * only. Wildcards and execution escapes are deliberately NOT honored (see
 * src/lib/csp.ts FORBIDDEN_SOURCE). script-src / style-src are NOT seams —
 * the strict script-src stays the XSS rampart and is never opened per-app.
 */
export const cspExtraSources: {
  frameSrc?: string[];
  connectSrc?: string[];
  mediaSrc?: string[];
  fontSrc?: string[];
  imgSrc?: string[];
} = {};

export type ConfigPlugin = (config: NextConfig) => NextConfig;

/**
 * Next plugins that must WRAP the whole config (next-intl, Sentry, MDX,
 * bundle-analyzer). Each entry is a `(config) => config` wrapper — pre-bind
 * options. next.config.ts applies these and re-asserts the security headers
 * afterward, so a plugin can extend the build but never drop the day-1 posture.
 * For i18n, install the `i18n` module and add its plugin here per its AGENT.md.
 *
 *   export const userConfigPlugins: ConfigPlugin[] = [
 *     createNextIntlPlugin('./src/i18n/request.ts'),
 *     (config) => withSentryConfig(config, { silent: true }),
 *   ];
 */
export const userConfigPlugins: ConfigPlugin[] = [];
