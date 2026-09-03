import { describe, expect, it } from 'vitest';
import { buildCsp } from '@/lib/csp';

// Locks the platform CSP posture so a future edit can't silently re-tighten
// style-src (breaks Radix/shadcn in prod) or loosen script-src (XSS regression).
describe('buildCsp', () => {
  const scriptSrc = (csp: string) =>
    csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
  const styleSrc = (csp: string) =>
    csp.split(';').find((d) => d.trim().startsWith('style-src')) ?? '';

  it('keeps script-src strict in production: nonce + strict-dynamic, no unsafe-inline/eval', () => {
    const s = scriptSrc(buildCsp('abc123', false));
    expect(s).toContain("'nonce-abc123'");
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s).not.toContain("'unsafe-eval'");
  });

  it('allows inline styles (style-src unsafe-inline, NO style nonce) so headless UI works in prod', () => {
    const s = styleSrc(buildCsp('abc123', false));
    expect(s).toContain("'unsafe-inline'");
    // a nonce on style-src would make 'unsafe-inline' ignored — must not be present
    expect(s).not.toContain('nonce-');
  });

  it('only adds unsafe-eval to script-src in development', () => {
    expect(scriptSrc(buildCsp('n', true))).toContain("'unsafe-eval'");
    expect(scriptSrc(buildCsp('n', false))).not.toContain("'unsafe-eval'");
  });

  it('locks the rest of the policy down', () => {
    const csp = buildCsp('n', false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('appends a configured API origin to connect-src', () => {
    expect(buildCsp('n', false, 'https://api.example.com')).toContain(
      "connect-src 'self' https://api.example.com",
    );
  });
});
