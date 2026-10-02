/** Tiny hash-path store shared by the shims and the demo router. */

type Listener = () => void;
const listeners = new Set<Listener>();

export function getHashPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw === '' ? '/dashboard' : raw.split('?')[0]!;
}

export function navigate(href: string): void {
  const target = `#${href}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

function emit(): void {
  for (const listener of listeners) listener();
}

let started = false;
export function ensureHashListener(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('hashchange', emit);
}

export function subscribeHash(listener: Listener): () => void {
  listeners.add(listener);
  ensureHashListener();
  return () => listeners.delete(listener);
}
