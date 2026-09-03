export const isImageWorkerSupported: boolean =
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

let cached: Worker | null = null;

export function getImageWorker(): Worker | null {
  if (!isImageWorkerSupported) return null;
  if (cached) return cached;
  cached = new Worker(new URL('../../workers/image-compress.worker.ts', import.meta.url), {
    type: 'module',
    name: 'image-compress',
  });
  return cached;
}

export function terminateImageWorker(): void {
  if (!cached) return;
  cached.terminate();
  cached = null;
}

let warmupInflight: Promise<void> | null = null;

export function warmupImageWorker(): Promise<void> {
  if (!isImageWorkerSupported) return Promise.resolve();
  if (warmupInflight) return warmupInflight;

  warmupInflight = new Promise<void>((resolve) => {
    const w = getImageWorker();
    if (!w) {
      resolve();
      return;
    }
    const onPong = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === 'pong') {
        w.removeEventListener('message', onPong);
        resolve();
      }
    };
    w.addEventListener('message', onPong);
    w.postMessage({ type: 'ping' });
    // Resolve after a hard cap so a stalled worker never blocks app boot.
    setTimeout(() => {
      w.removeEventListener('message', onPong);
      resolve();
    }, 1500);
  });

  return warmupInflight;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    terminateImageWorker();
  });
}
