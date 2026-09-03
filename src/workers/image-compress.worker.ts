export type IncomingMessage =
  | { type: 'ping' }
  | {
      type: 'compress';
      jobId: string;
      quality: number;
      files: Array<{ name: string; bytes: ArrayBuffer }>;
    };

export type OutgoingMessage =
  | { type: 'pong' }
  | { type: 'ready'; jobId: string; total: number }
  | {
      type: 'chunk';
      jobId: string;
      filename: string;
      originalBytes: ArrayBuffer;
      blob: Blob;
    }
  | {
      type: 'error';
      jobId: string;
      filename?: string;
      code: 'not_webp_slice_yet' | 'decode_failed' | 'unsupported_format' | 'encode_failed';
      message: string;
    }
  | { type: 'done'; jobId: string };

// RIFF/WEBP container header — the first 12 bytes of every WebP file. We
// sanity-check the first 4 bytes after decoding, because createImageBitmap
// will happily accept a WebP by content-type yet fail to decode it cleanly.
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

function isWebpBytes(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new Uint8Array(bytes, 0, 12);
  for (let i = 0; i < 4; i++) {
    if (view[i] !== RIFF[i]) return false;
  }
  for (let i = 0; i < 4; i++) {
    if (view[8 + i] !== WEBP[i]) return false;
  }
  return true;
}

async function compressOne(
  jobId: string,
  filename: string,
  bytes: ArrayBuffer,
  quality: number,
): Promise<void> {
  if (!isWebpBytes(bytes)) {
    const out: OutgoingMessage = {
      type: 'error',
      jobId,
      filename,
      code: 'not_webp_slice_yet',
      message: 'JPEG/PNG slice not yet shipped — fall back to the server route for this file',
    };
    self.postMessage(out);
    return;
  }

  let bitmap: ImageBitmap;
  try {
    // OffscreenCanvas requires createImageBitmap, available in module workers
    // on Chromium/Firefox/Safari modern. The Blob wrapper carries the
    // declared image/webp type so the decoder picks the right path.
    const blob = new Blob([bytes], { type: 'image/webp' });
    bitmap = await createImageBitmap(blob);
  } catch {
    const out: OutgoingMessage = {
      type: 'error',
      jobId,
      filename,
      code: 'decode_failed',
      message: 'WebP could not be decoded by the browser',
    };
    self.postMessage(out);
    return;
  }

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const out: OutgoingMessage = {
        type: 'error',
        jobId,
        filename,
        code: 'decode_failed',
        message: 'OffscreenCanvas 2d context unavailable',
      };
      self.postMessage(out);
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // Quality param is 0..1 in the WebP encoder API; we normalize the user
    // 1..100 slider value the server route uses, keeping the seam
    // single-sourced in the client (no slider remap mistake possible).
    const q01 = Math.min(1, Math.max(0, quality / 100));
    const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: q01 });

    // The ArrayBuffer copy is intentional: postMessage detaches the source
    // ArrayBuffer, so we hand the worker-side array to the main thread and
    // let it reassemble the manifest. Outbound Blob is structured-cloned.
    self.postMessage({
      type: 'chunk',
      jobId,
      filename,
      originalBytes: bytes,
      blob: encoded,
    } satisfies OutgoingMessage);
  } catch {
    const out: OutgoingMessage = {
      type: 'error',
      jobId,
      filename,
      code: 'encode_failed',
      message: 'OffscreenCanvas WebP encode failed',
    };
    self.postMessage(out);
  }
}

self.addEventListener('message', async (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;

  if (msg.type === 'ping') {
    self.postMessage({ type: 'pong' } satisfies OutgoingMessage);
    return;
  }

  if (msg.type === 'compress') {
    const { jobId, quality, files } = msg;
    self.postMessage({
      type: 'ready',
      jobId,
      total: files.length,
    } satisfies OutgoingMessage);

    for (const f of files) {
      await compressOne(jobId, f.name, f.bytes, quality);
    }

    self.postMessage({ type: 'done', jobId } satisfies OutgoingMessage);
  }
});
