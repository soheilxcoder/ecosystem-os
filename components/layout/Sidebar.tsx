'use client';

/**
 * Persistent left sidebar — 01-INFORMATION-ARCHITECTURE.md §1.
 *
 * Responsive behaviour:
 *   ≥1280px  full labels
 *   768–1279 icon-only rail
 *   <768px   hidden (replaced by the bottom tab bar)
 *
 * The Hub Console is rendered only for users with an active Company X hub role —
 * invisible, not disabled (§1).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { NAV_ITEMS } from './nav-items';
import {
  IconBell,
  IconChevronDown,
  IconSettings,
  type IconProps,
} from '../ui/icons';
import type { ApiHolding } from '../../lib/types';

export interface SidebarProps {
  userName: string;
  userEmail: string;
  orgName: string;
  holdings: ApiHolding[];
  activeHoldingId: string | null;
  isHubUser: boolean;
  notificationCount: number;
  urgentCount: number;
  signOutAction: () => void;
}

export function Sidebar({
  userName,
  userEmail,
  orgName,
  holdings,
  activeHoldingId,
  isHubUser,
  notificationCount,
  urgentCount,
  signOutAction,
}: SidebarProps) {
  const pathname = usePathname();
  const [holdingMenuOpen, setHoldingMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const activeHolding = holdings.find((h) => h.id === activeHoldingId) ?? null;
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const items = NAV_ITEMS.filter((item) => !item.hubOnly || isHubUser);

  return (
    <aside className="hidden shrink-0 flex-col border-r border-line-200 bg-white md:flex md:w-rail xl:w-sidebar">
      {/* Org / holding switcher — only rendered when the user spans holdings. */}
      <div className="relative border-b border-line-200 px-3 py-3">
        <button
          type="button"
          onClick={() => setHoldingMenuOpen((open) => !open)}
          aria-expanded={holdingMenuOpen}
          className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-paper-100 xl:gap-2"
        >
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded bg-signal-600 text-xs font-semibold text-white"
            aria-hidden
          >
            {orgName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden min-w-0 flex-1 xl:block">
            <span className="block truncate text-sm font-medium text-ink-950">{orgName}</span>
            {holdings.length > 1 && activeHolding ? (
              <span className="block truncate text-xs text-slate-500">{activeHolding.name}</span>
            ) : null}
          </span>
          {holdings.length > 1 ? (
            <IconChevronDown size={16} className="hidden shrink-0 text-slate-500 xl:block" />
          ) : null}
        </button>

        {holdingMenuOpen && holdings.length > 1 ? (
          <div className="absolute left-3 right-3 z-30 mt-1 rounded border border-line-200 bg-white py-1 shadow-popover">
            {holdings.map((holding) => (
              <button
                key={holding.id}
                type="button"
                onClick={() => setHoldingMenuOpen(false)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-100"
              >
                {holding.name}
                {holding.id === activeHoldingId ? (
                  <span className="ml-2 text-xs text-signal-600">current</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav aria-label="Modules" className="flex-1 overflow-y-auto py-2">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <SidebarLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                available={item.available}
                phase={item.phase}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line-200 py-2">
        <ul>
          <li>
            <SidebarLink
              href="/notifications"
              label="Notifications"
              icon={IconBell}
              active={pathname === '/notifications'}
              available={false}
              phase={6}
              badge={notificationCount}
              urgent={urgentCount > 0}
            />
          </li>
          <li>
            <SidebarLink
              href="/settings"
              label="Settings"
              icon={IconSettings}
              active={pathname === '/settings'}
              available={false}
              phase={6}
            />
          </li>
        </ul>

        <div className="relative border-t border-line-200 px-3 py-3">
          <button
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-expanded={accountMenuOpen}
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-paper-100"
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded border border-line-300 bg-paper-100 text-xs font-medium text-ink-700"
              aria-hidden
            >
              {initials || '··'}
            </span>
            <span className="hidden min-w-0 flex-1 xl:block">
              <span className="block truncate text-sm text-ink-950">{userName}</span>
              <span className="block truncate text-xs text-slate-500">{userEmail}</span>
            </span>
            <IconChevronDown size={16} className="hidden shrink-0 text-slate-500 xl:block" />
          </button>

          {accountMenuOpen ? (
            <div className="absolute bottom-14 left-3 right-3 z-30 rounded border border-line-200 bg-white py-1 shadow-popover">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-100"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

interface SidebarLinkProps {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  active: boolean;
  available: boolean;
  phase: number;
  badge?: number;
  urgent?: boolean;
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  available,
  phase,
  badge,
  urgent,
}: SidebarLinkProps) {
  const base =
    'group relative mx-2 flex items-center gap-3 rounded px-2 py-2 text-sm transition-colors';
  const tone = active
    ? 'bg-signal-50 text-signal-700'
    : available
      ? 'text-ink-700 hover:bg-paper-100'
      : 'text-slate-300';

  const content = (
    <>
      <Icon size={20} className="shrink-0" />
      <span className="hidden min-w-0 flex-1 truncate xl:block">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`tabular ml-auto hidden rounded px-1.5 py-0.5 text-2xs xl:block ${
            urgent ? 'bg-status-alert text-white' : 'bg-paper-100 text-slate-500'
          }`}
        >
          {badge}
        </span>
      ) : null}
      {/* Rail mode: a dot marks the active item when labels are hidden. */}
      {active ? (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded bg-signal-600"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (!available) {
    return (
      <span
        className={`${base} ${tone} cursor-not-allowed`}
        title={`${label} — planned for phase ${phase}`}
        aria-disabled="true"
      >
        {content}
      </span>
    );
  }

  return (
    <Link href={href} className={`${base} ${tone}`} aria-current={active ? 'page' : undefined}>
      {content}
    </Link>
  );
}
