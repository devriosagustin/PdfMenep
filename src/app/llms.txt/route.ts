import { renderLlmsTxt } from '@/lib/llms';
import { llmsConfig } from '@/lib/llms-config';

export async function GET(): Promise<Response> {
  // Read SEO_INDEXABLE at request time (not module scope) so the fail-closed gate
  // matches robots.ts and stays stubbable in tests.
  if (process.env.SEO_INDEXABLE !== 'true') {
    return new Response('Not Found', { status: 404 });
  }
  return new Response(await renderLlmsTxt(llmsConfig), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
