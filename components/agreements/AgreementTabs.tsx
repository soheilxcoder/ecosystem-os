'use client';

/** Tab bar for the agreements area — active state comes from the URL, not local state. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/agreements/active', label: 'Active agreements' },
  { href: '/agreements/proposals', label: 'Proposals inbox' },
];

export function AgreementTabs({ inboxCount = 0 }: { inboxCount?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Agreement views" className="mb-4 flex gap-1 border-b border-line-200">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? 'border-signal-600 text-ink-950'
                : 'border-transparent text-slate-500 hover:text-ink-950'
            }`}
          >
            {tab.label}
            {tab.href.endsWith('proposals') && inboxCount > 0 ? (
              <span className="ml-1 rounded bg-signal-50 px-1.5 py-0.5 text-xs text-signal-700">
                {inboxCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
