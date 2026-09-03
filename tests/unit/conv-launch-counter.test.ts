import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bumpToolLaunchOnMount } from '../../src/lib/analytics/tool-launch-counter';

function patchPathname(pathname: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, pathname },
  });
}

describe('bumpToolLaunchOnMount', () => {
  let originalLocalStorage: PropertyDescriptor | undefined;
  let originalSessionStorage: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    originalSessionStorage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    window.localStorage.clear();
    window.sessionStorage.clear();
    patchPathname('/comprimir-pdf');
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage);
    }
    if (originalSessionStorage) {
      Object.defineProperty(window, 'sessionStorage', originalSessionStorage);
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
    patchPathname('/');
  });

  it('increments conv-launch-count:<route> from 0 → 1 on first call', () => {
    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBeNull();

    bumpToolLaunchOnMount();

    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBe('1');
  });

  it('StrictMode-safe: a second call in the same tab session does NOT re-increment', () => {
    bumpToolLaunchOnMount();
    bumpToolLaunchOnMount();

    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBe('1');
  });

  it('writes the counter under a key shaped exactly as "conv-launch-count:" + pathname', () => {
    patchPathname('/recortar-pdf');

    bumpToolLaunchOnMount();

    expect(window.localStorage.getItem('conv-launch-count:/recortar-pdf')).toBe('1');
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe('conv-launch-count:/recortar-pdf');
  });

  it('keeps per-route counters independent (each route gets its own key)', () => {
    bumpToolLaunchOnMount();

    patchPathname('/recortar-pdf');
    bumpToolLaunchOnMount();
    bumpToolLaunchOnMount();

    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBe('1');
    expect(window.localStorage.getItem('conv-launch-count:/recortar-pdf')).toBe('1');
  });

  it('swallows localStorage errors (private-mode guard) without throwing', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => {
          throw new Error('SecurityError: storage unavailable');
        },
        setItem: () => {
          throw new Error('SecurityError: storage unavailable');
        },
      },
    });

    expect(() => bumpToolLaunchOnMount()).not.toThrow();
  });

  it('swallows sessionStorage errors too without throwing', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: () => {
          throw new Error('SecurityError: storage unavailable');
        },
        setItem: () => {
          throw new Error('SecurityError: storage unavailable');
        },
      },
    });

    expect(() => bumpToolLaunchOnMount()).not.toThrow();
  });

  it('tracks increments across calls when the per-route guard has been removed (re-mount simulation)', () => {
    bumpToolLaunchOnMount();
    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBe('1');

    window.sessionStorage.removeItem('conv-launch-bumped:/comprimir-pdf');
    bumpToolLaunchOnMount();
    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBe('2');

    window.sessionStorage.removeItem('conv-launch-bumped:/comprimir-pdf');
    bumpToolLaunchOnMount();
    expect(window.localStorage.getItem('conv-launch-count:/comprimir-pdf')).toBe('3');
  });
});
