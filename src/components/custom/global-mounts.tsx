'use client';

import { useEffect } from 'react';

import { bumpToolLaunchOnMount } from '@/lib/analytics/tool-launch-counter';
import { warmupImageWorker } from '@/lib/workers/image-compress-pool';

export function GlobalMounts() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    void warmupImageWorker();
    bumpToolLaunchOnMount();
  }, []);

  return null;
}
