'use client';

/**
 * Mobile tab bar — 01-INFORMATION-ARCHITECTURE.md §1.
 *
 * Below 768px the sidebar is replaced by a five-item bottom bar
 * (Dashboard, My Pod, Budget, Calendar, Notifications).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MOBILE_NAV_ITEMS } from './nav-items';
import { IconBell } from '../ui/icons';

export interface BottomTabBarProps {
  isHubUser: boolean;
  notificationCount: number;
}

export function BottomTabBar({ isHubUser, notificationCount }: BottomTabBarProps) {
  const pathname = usePathname();
  const items = [
    ...MOBILE_NAV_ITEMS.filter((item) => !item.hubOnly || isHubUser),
    { href: '/notifications', label: 'Notifications', icon: IconBell, available: false, phase: 6 },
  ].slice(0, 5);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line-200 bg-white md:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const className = `flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs ${
          active ? 'text-signal-600' : item.available ? 'text-slate-500' : 'text-slate-300'
        }`;

        const content = (
          <>
            <span className="relative">
              <Icon size={20} />
              {item.href === '/notifications' && notificationCount > 0 ? (
                <span
                  className="absolute -right-1.5 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-status-alert px-1 text-[9px] text-white"
                  aria-label={`${notificationCount} unread`}
                >
                  {notificationCount}
                </span>
              ) : null}
            </span>
            <span className="truncate">{item.label.replace(/\s*\(.*\)$/, '')}</span>
          </>
        );

        return item.available ? (
          <Link key={item.href} href={item.href} className={className}>
            {content}
          </Link>
        ) : (
          <span key={item.href} className={className} aria-disabled="true">
            {content}
          </span>
        );
      })}
    </nav>
  );
}
