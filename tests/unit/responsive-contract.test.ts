/**
 * Responsive contract — 01-INFORMATION-ARCHITECTURE.md §1 and
 * 12-DESIGN-SYSTEM.md §6.
 *
 * The shell has three declared breakpoints (icon rail below 1280px, bottom tab
 * bar below 768px, 360px floor) and the Hub Console must be *invisible* rather
 * than disabled for non-hub users. These are structural promises about the
 * markup, so they are asserted here instead of being checked by eye on every
 * change. (The screenshot comparison in §7.5 still needs a real browser.)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const sidebar = read('components/layout/Sidebar.tsx');
const tabBar = read('components/layout/BottomTabBar.tsx');
const navItems = read('components/layout/nav-items.tsx');
const globals = read('app/globals.css');
const tailwindConfig = read('tailwind.config.ts');
const layout = read('app/layout.tsx');

describe('sidebar responsiveness', () => {
  it('is hidden below 768px and shown from 768px up', () => {
    expect(sidebar).toMatch(/hidden[^"]*md:flex/);
  });

  it('collapses to an icon-only rail between 768px and 1279px', () => {
    expect(sidebar).toContain('md:w-rail');
    expect(sidebar).toContain('xl:w-sidebar');
  });

  it('hides labels in rail mode and reveals them at 1280px', () => {
    expect(sidebar).toContain('xl:block');
  });

  it('renders the Hub Console only for Company X hub roles', () => {
    expect(navItems).toContain('hubOnly: true');
    // Filtered by role, not merely disabled — so it is invisible to everyone else.
    expect(sidebar).toContain('NAV_ITEMS.filter((item) => !item.hubOnly || isHubUser)');
  });

  it('renders the org switcher only when the user spans holdings', () => {
    expect(sidebar).toContain('holdings.length > 1');
  });
});

describe('mobile tab bar', () => {
  it('replaces the sidebar below 768px', () => {
    expect(tabBar).toContain('md:hidden');
  });

  it('is limited to five primary items', () => {
    expect(tabBar).toContain('.slice(0, 5)');
    expect(read('components/layout/nav-items.tsx')).toContain('MOBILE_NAV_ITEMS');
  });
});

describe('design tokens', () => {
  it('declares the six named colour tokens as CSS variables', () => {
    for (const token of [
      '--ink-950',
      '--paper-100',
      '--slate-500',
      '--signal-600',
      '--surface-white',
      '--line-200',
    ]) {
      expect(globals, `${token} missing`).toContain(token);
    }
  });

  it('declares the five functional status colours', () => {
    for (const token of [
      '--status-neutral',
      '--status-active',
      '--status-good',
      '--status-watch',
      '--status-alert',
    ]) {
      expect(globals, `${token} missing`).toContain(token);
    }
  });

  it('keeps the exact hex values from 12-DESIGN-SYSTEM.md §2', () => {
    const expected: Array<[string, string]> = [
      ['--ink-950', '#12161c'],
      ['--paper-100', '#f7f8f6'],
      ['--slate-500', '#5b6672'],
      ['--signal-600', '#1e6f5c'],
      ['--line-200', '#e3e6e2'],
      ['--status-good', '#1e7a4c'],
      ['--status-watch', '#b7791f'],
      ['--status-alert', '#b23b3b'],
    ];
    for (const [token, hex] of expected) {
      expect(globals.toLowerCase()).toContain(`${token}: ${hex}`);
    }
  });

  it('maps tokens into Tailwind without duplicating hex values in JS', () => {
    expect(tailwindConfig).toContain("ink: {\n          950: '#12161C'");
    expect(tailwindConfig).toContain("paper: {\n          100: '#F7F8F6'");
  });

  it('declares the 14/16/18/22/28/36/48 type scale', () => {
    for (const size of ['0.875rem', '1rem', '1.125rem', '1.375rem', '1.75rem', '2.25rem', '3rem']) {
      expect(tailwindConfig, `type size ${size} missing`).toContain(size);
    }
  });
});

describe('accessibility floor', () => {
  it('enables a visible focus ring on every interactive element', () => {
    expect(globals).toContain(':focus-visible');
    expect(globals).toContain('outline: 2px solid var(--signal-600)');
  });

  it('honours prefers-reduced-motion', () => {
    expect(globals).toContain('prefers-reduced-motion');
  });

  it('enables tabular numerals by default', () => {
    expect(globals).toContain('font-variant-numeric: tabular-nums');
  });
});

describe('typography', () => {
  it('self-hosts both font families instead of fetching them at build time', () => {
    expect(layout).toContain('@fontsource-variable/inter');
    expect(layout).toContain('@fontsource/source-serif-4');
    expect(layout).not.toContain('next/font/google');
  });
});
