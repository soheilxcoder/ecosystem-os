/**
 * Sidebar navigation model — 01-INFORMATION-ARCHITECTURE.md §1.
 *
 * Items are declared with the roadmap phase that delivers them so the shell can
 * be honest about what exists: an unbuilt module is rendered as visibly
 * "planned" instead of a link to a 404 (12-DESIGN-SYSTEM.md §3: empty states
 * are instructions, not apologies). Flipping `available` to true is part of each
 * phase's definition of done.
 */

import type { IconProps } from '../ui/icons';
import {
  IconAgreement,
  IconArchive,
  IconBudget,
  IconCalendar,
  IconCoaching,
  IconDashboard,
  IconHub,
  IconPod,
  IconReview,
} from '../ui/icons';

export interface NavItem {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  /** Company X hub roles only (invisible, not disabled, for everyone else). */
  hubOnly?: boolean;
  /** Roadmap phase that delivers this module. */
  phase: number;
  /** Whether the route exists yet. */
  available: boolean;
  /** Shown in the five-item mobile tab bar. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: IconDashboard, phase: 0, available: true, primary: true },
  { href: '/pod', label: 'My Pod', icon: IconPod, phase: 1, available: true, primary: true },
  { href: '/agreements', label: 'Agreements (CLOU)', icon: IconAgreement, phase: 2, available: true },
  { href: '/budget', label: 'Budget Market', icon: IconBudget, phase: 4, available: false, primary: true },
  { href: '/calendar', label: 'Sprint Calendar', icon: IconCalendar, phase: 1, available: true, primary: true },
  { href: '/coaching', label: 'Coaching', icon: IconCoaching, phase: 5, available: false },
  { href: '/review', label: 'Peer Review & Cases', icon: IconReview, phase: 3, available: true, primary: true },
  { href: '/archive', label: 'Archive', icon: IconArchive, phase: 6, available: false },
  { href: '/hub', label: 'Hub Console', icon: IconHub, hubOnly: true, phase: 7, available: false },
];

/** The five primary items for the mobile tab bar (01-INFORMATION-ARCHITECTURE.md §1). */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.primary);
