'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import { MAX_FILENAME_LEN } from '@/lib/contracts/image-compress';

export type LocalHistoryItem = {
  id: string;
  ts: number;
  inputName: string;
  outputName: string;
  outputSizeBytes: number;
  outputFormat: string;
  kind: string;
};

const MAX_ITEMS = 5;
const STORAGE_PREFIX = 'conv-history:';

const HistoryItemSchema = z.object({
  id: z.string().min(1).max(200),
  ts: z.number().int().nonnegative(),
  inputName: z.string().max(MAX_FILENAME_LEN),
  outputName: z.string().max(MAX_FILENAME_LEN),
  outputSizeBytes: z.number().int().nonnegative(),
  outputFormat: z.string().min(1).max(16),
  kind: z.string().min(1).max(64),
});

const HistoryArraySchema = z.array(HistoryItemSchema.passthrough());

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

function removeKey(slug: string): void {
  try {
    window.localStorage.removeItem(storageKey(slug));
  } catch {
    // ignore — storage may be unavailable in private mode or restricted contexts
  }
}

function readRaw(slug: string): LocalHistoryItem[] {
  const key = storageKey(slug);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return [];
  }
  if (raw === null || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeKey(slug);
    return [];
  }
  if (!Array.isArray(parsed)) {
    removeKey(slug);
    return [];
  }
  const result = HistoryArraySchema.safeParse(parsed);
  if (result.success) return result.data;
  const filtered: LocalHistoryItem[] = [];
  for (const candidate of parsed) {
    const item = HistoryItemSchema.safeParse(candidate);
    if (item.success) {
      filtered.push(item.data as LocalHistoryItem);
    }
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(filtered));
  } catch {
    // ignore
  }
  return filtered;
}

function writeRaw(slug: string, items: LocalHistoryItem[]): void {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function useLocalHistory(slug: string): {
  items: LocalHistoryItem[];
  add: (entry: Omit<LocalHistoryItem, 'ts'>) => void;
  remove: (id: string) => void;
  clear: () => void;
  isReady: boolean;
} {
  const [items, setItems] = useState<LocalHistoryItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setItems(readRaw(slug));
    setIsReady(true);
  }, [slug]);

  const add = useCallback(
    (entry: Omit<LocalHistoryItem, 'ts'>): void => {
      const stamped: LocalHistoryItem = { ...entry, ts: Date.now() };
      setItems((prev) => {
        const without = prev.filter((item) => item.id !== stamped.id);
        const next = [stamped, ...without].slice(0, MAX_ITEMS);
        writeRaw(slug, next);
        return next;
      });
    },
    [slug],
  );

  const remove = useCallback(
    (id: string): void => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        writeRaw(slug, next);
        return next;
      });
    },
    [slug],
  );

  const clear = useCallback((): void => {
    removeKey(slug);
    setItems([]);
  }, [slug]);

  return { items, add, remove, clear, isReady };
}
