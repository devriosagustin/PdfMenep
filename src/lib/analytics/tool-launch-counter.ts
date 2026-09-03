const COUNT_PREFIX = 'conv-launch-count:';
const GUARD_PREFIX = 'conv-launch-bumped:';

function shouldSkipPath(path: string): boolean {
  if (!path) return true;
  if (path.startsWith('/_next/') || path === '/_next') return true;
  return false;
}

export function bumpToolLaunchOnMount(): void {
  try {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    if (!path) return;
    const normalized = path.replace(/\/+$/, '') || '/';
    if (shouldSkipPath(normalized)) return;

    const guardKey = GUARD_PREFIX + normalized;
    if (window.sessionStorage.getItem(guardKey) !== null) return;
    window.sessionStorage.setItem(guardKey, '1');

    const countKey = COUNT_PREFIX + normalized;
    const raw = window.localStorage.getItem(countKey);
    const current = raw == null ? 0 : Number.parseInt(raw, 10);
    const prev = Number.isFinite(current) && current > 0 ? current : 0;
    const next = prev >= Number.MAX_SAFE_INTEGER - 1 ? prev : prev + 1;
    window.localStorage.setItem(countKey, String(next));
  } catch {
    // best-effort: localStorage may be unavailable in private mode / sandbox
  }
}
