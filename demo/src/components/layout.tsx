/**
 * i18n-aware copies of the shell chrome (Sidebar + BottomTabBar).
 *
 * Same structure, breakpoints and tokens as the production components; the
 * only differences are translated labels and logical (RTL-safe) positioning.
 * The nav model mirrors components/layout/nav-items.tsx.
 */
import Link from '../shims/link';
import { usePathname } from '../shims/navigation';
import { useState } from 'react';
import {
  IconAgreement,
  IconArchive,
  IconBell,
  IconBudget,
  IconCalendar,
  IconChevronDown,
  IconCoaching,
  IconDashboard,
  IconHub,
  IconPod,
  IconReview,
  IconSettings,
  type IconProps,
} from '../../../components/ui/icons';
import type { ApiHolding } from '../../../lib/types';
import { useI18n } from '../i18n';
import type { StringKey } from '../i18n/translations';

interface NavItem {
  href: string;
  labelKey: StringKey;
  icon: (props: IconProps) => React.ReactElement;
  hubOnly?: boolean;
  phase: number;
  available: boolean;
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: IconDashboard, phase: 0, available: true, primary: true },
  { href: '/pod', labelKey: 'nav.myPod', icon: IconPod, phase: 1, available: true, primary: true },
  { href: '/agreements', labelKey: 'nav.agreements', icon: IconAgreement, phase: 2, available: true },
  { href: '/budget', labelKey: 'nav.budget', icon: IconBudget, phase: 4, available: true, primary: true },
  { href: '/calendar', labelKey: 'nav.calendar', icon: IconCalendar, phase: 1, available: true, primary: true },
  { href: '/coaching', labelKey: 'nav.coaching', icon: IconCoaching, phase: 5, available: true },
  { href: '/review', labelKey: 'nav.review', icon: IconReview, phase: 3, available: true, primary: true },
  { href: '/archive', labelKey: 'nav.archive', icon: IconArchive, phase: 6, available: true },
  { href: '/hub', labelKey: 'nav.hub', icon: IconHub, hubOnly: true, phase: 7, available: true },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);

/* ---------------------------------------------------------------- sidebar --- */

export interface SidebarI18nProps {
  userName: string;
  userEmail: string;
  orgName: string;
  holdings: ApiHolding[];
  activeHoldingId: string | null;
  isHubUser: boolean;
  notificationCount: number;
  urgentCount: number;
  signOutAction: () => void;
  holdingLabel: (holding: ApiHolding) => string;
}

export function SidebarI18n({
  userName,
  userEmail,
  orgName,
  holdings,
  activeHoldingId,
  isHubUser,
  notificationCount,
  urgentCount,
  signOutAction,
  holdingLabel,
}: SidebarI18nProps) {
  const pathname = usePathname();
  const { t } = useI18n();
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
    <aside className="hidden shrink-0 flex-col border-e border-line-200 bg-white md:flex md:w-rail xl:w-sidebar">
      <div className="relative border-b border-line-200 px-3 py-3">
        <button
          type="button"
          onClick={() => setHoldingMenuOpen((open) => !open)}
          aria-expanded={holdingMenuOpen}
          className="flex w-full items-center gap-2 rounded px-1 py-1 text-start hover:bg-paper-100 xl:gap-2"
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
              <span className="block truncate text-xs text-slate-500">
                {holdingLabel(activeHolding)}
              </span>
            ) : null}
          </span>
          {holdings.length > 1 ? (
            <IconChevronDown size={16} className="hidden shrink-0 text-slate-500 xl:block" />
          ) : null}
        </button>

        {holdingMenuOpen && holdings.length > 1 ? (
          <div className="absolute inset-x-3 z-30 mt-1 rounded border border-line-200 bg-white py-1 shadow-popover">
            {holdings.map((holding) => (
              <button
                key={holding.id}
                type="button"
                onClick={() => setHoldingMenuOpen(false)}
                className="block w-full px-3 py-1.5 text-start text-sm hover:bg-paper-100"
              >
                {holdingLabel(holding)}
                {holding.id === activeHoldingId ? (
                  <span className="ms-2 text-xs text-signal-600">{t('nav.current')}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav aria-label={t('nav.aria')} className="flex-1 overflow-y-auto py-2">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <SidebarLink
                href={item.href}
                label={t(item.labelKey)}
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
              label={t('nav.notifications')}
              icon={IconBell}
              active={pathname === '/notifications'}
              available={true}
              phase={6}
              badge={notificationCount}
              urgent={urgentCount > 0}
            />
          </li>
          <li>
            <SidebarLink
              href="/settings"
              label={t('nav.settings')}
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
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-start hover:bg-paper-100"
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
            <div className="absolute bottom-14 inset-x-3 z-30 rounded border border-line-200 bg-white py-1 shadow-popover">
              <button
                type="button"
                onClick={signOutAction}
                className="block w-full px-3 py-1.5 text-start text-sm hover:bg-paper-100"
              >
                {t('shell.signOut')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
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
}: {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  active: boolean;
  available: boolean;
  phase: number;
  badge?: number;
  urgent?: boolean;
}) {
  const { t } = useI18n();
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
          key={badge}
          className={`tabular ms-auto hidden animate-badge-pop rounded px-1.5 py-0.5 text-2xs xl:block ${
            urgent ? 'bg-status-alert text-white' : 'bg-paper-100 text-slate-500'
          }`}
        >
          {badge}
        </span>
      ) : null}
      {active ? (
        <span
          className="absolute start-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded bg-signal-600"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (!available) {
    return (
      <span
        className={`${base} ${tone} cursor-not-allowed`}
        title={t('nav.planned', { label, phase })}
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

/* ------------------------------------------------------------ bottom tabs --- */

export function BottomTabBarI18n({
  isHubUser,
  notificationCount,
}: {
  isHubUser: boolean;
  notificationCount: number;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const items = [
    ...MOBILE_NAV_ITEMS.filter((item) => !item.hubOnly || isHubUser),
    {
      href: '/notifications',
      labelKey: 'nav.notifications' as StringKey,
      icon: IconBell,
      available: true,
      phase: 6,
    },
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
                  key={notificationCount}
                  className="absolute -end-1.5 -top-1 grid h-3.5 min-w-3.5 animate-badge-pop place-items-center rounded-full bg-status-alert px-1 text-[9px] text-white"
                >
                  {notificationCount}
                </span>
              ) : null}
            </span>
            <span className="truncate">{t(item.labelKey)}</span>
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
