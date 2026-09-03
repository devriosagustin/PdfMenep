import { describe, expect, it } from 'vitest';

import { CompressManifest } from '@/lib/contracts/image-compress';
import {
  getImageWorker,
  isImageWorkerSupported,
  terminateImageWorker,
} from '@/lib/workers/image-compress-pool';

describe('image-compress worker protocol — surface', () => {
  it('exports isImageWorkerSupported as a boolean', () => {
    expect(typeof isImageWorkerSupported).toBe('boolean');
  });

  it('returns null from getImageWorker when OffscreenCanvas is not exposed (jsdom here)', () => {
    // jsdom deliberately doesn't ship OffscreenCanvas on the global scope,
    // so the pool's capability gate must produce a no-op Worker handle.
    expect(typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas).toBe('undefined');
    expect(getImageWorker()).toBe(null);
  });

  it('terminateImageWorker is idempotent and never throws', () => {
    terminateImageWorker();
    terminateImageWorker();
    expect(getImageWorker()).toBe(null);
  });
});

describe('client-assembled manifest round-trips through CompressManifest.safeParse', () => {
  // The client worker path builds this object literal before serializing it
  // into the ZIP. The server route builds the SAME shape — they share one
  // parser. If drift creeps in (e.g. a missing key here), the table would
  // silently stay empty when the user downloads the worker-produced ZIP.
  it('accepts the exact shape image-compress-client assembles', () => {
    const assembled = {
      generatedAt: new Date().toISOString(),
      quality: 75,
      totalIn: 1024,
      totalOut: 512,
      savingsPct: 50,
      files: [
        {
          filename: 'a.webp',
          originalSize: 512,
          compressedSize: 256,
          savingsPct: 50,
        },
        {
          filename: 'b.webp',
          originalSize: 512,
          compressedSize: 256,
          savingsPct: 50,
        },
      ],
    };
    const safe = CompressManifest.safeParse(assembled);
    expect(safe.success).toBe(true);
  });

  it('rejects an object missing the files key (the on-disk format check)', () => {
    const bad = {
      generatedAt: new Date().toISOString(),
      quality: 75,
      totalIn: 1,
      totalOut: 1,
      savingsPct: 0,
    };
    const safe = CompressManifest.safeParse(bad);
    expect(safe.success).toBe(false);
  });
});
