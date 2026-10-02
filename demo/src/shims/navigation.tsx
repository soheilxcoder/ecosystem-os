/**
 * `next/navigation` shim for the static showcase — just enough surface for the
 * reused production components (usePathname, useRouter, redirect, notFound).
 */
import { useSyncExternalStore } from 'react';
import { getHashPath, navigate, subscribeHash } from '../router';

export function usePathname(): string {
  return useSyncExternalStore(subscribeHash, getHashPath, () => '/dashboard');
}

export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
    back: () => window.history.back(),
    refresh: () => {},
    prefetch: () => Promise.resolve(),
  };
}

export function useParams(): Record<string, string> {
  return {};
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function redirect(href: string): never {
  navigate(href);
  throw new Error(`redirect:${href}`);
}

export function notFound(): never {
  throw new Error('not_found');
}
