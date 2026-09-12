import type { Config } from 'tailwindcss';

/**
 * Design tokens are declared once as CSS custom properties in
 * `app/globals.css` and mapped here, so the exact same token is available to
 * Tailwind utilities, inline styles and the hand-built SVG components
 * (Cycle Wheel, Rotation Badge) without duplicating hex values.
 *
 * Source of truth: 12-DESIGN-SYSTEM.md §2.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#12161C', // primary text / high-emphasis headings
          700: '#2A313A',
        },
        paper: {
          100: '#F7F8F6', // page background
        },
        slate: {
          500: '#5B6672', // secondary text, borders, dividers
          300: '#98A1AC',
        },
        signal: {
          600: '#1E6F5C', // primary brand / action — deep teal-green
          700: '#175A4B',
          200: '#C6DED6',
          50: '#EDF5F2',
        },
        surface: {
          white: '#FFFFFF',
        },
        line: {
          200: '#E3E6E2', // hairline borders
          300: '#CFD4CE',
        },
        status: {
          neutral: '#8B93A1', // draft / not started
          active: '#2B6CB0', // in progress / active
          good: '#1E7A4C', // completed / passed / healthy
          watch: '#B7791F', // flagged / at risk (amber)
          alert: '#B23B3B', // action required
        },
      },
      fontFamily: {
        // Display face: ledger-like serif — section headings + hero numbers only.
        // The var() fallbacks keep the stack valid even before the font CSS loads.
        display: [
          'var(--font-display, "Source Serif 4")',
          '"Source Serif 4"',
          'Newsreader',
          'Georgia',
          'serif',
        ],
        // UI face: grotesque sans — body, labels, buttons, tables.
        sans: [
          'var(--font-sans, "Inter Variable")',
          '"Inter Variable"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Type scale (base 16px): 14 / 16 / 18 / 22 / 28 / 36 / 48.
      // 36 and 48 are reserved for the "big number" treatment.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11 — meta labels
        xs: ['0.75rem', { lineHeight: '1.125rem' }], // 12
        sm: ['0.875rem', { lineHeight: '1.375rem' }], // 14
        base: ['1rem', { lineHeight: '1.5rem' }], // 16
        lg: ['1.125rem', { lineHeight: '1.75rem' }], // 18
        xl: ['1.375rem', { lineHeight: '1.875rem' }], // 22
        '2xl': ['1.75rem', { lineHeight: '2.25rem' }], // 28
        '3xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36 — big number
        '4xl': ['3rem', { lineHeight: '3.25rem' }], // 48 — big number
      },
      spacing: {
        rail: '4rem', // collapsed sidebar rail width
        sidebar: '16rem', // expanded sidebar width
      },
      maxWidth: {
        prose: '72ch', // body/pitch content cap (12-DESIGN-SYSTEM.md §2)
      },
      borderColor: {
        DEFAULT: '#E3E6E2',
      },
      boxShadow: {
        // Only secondary/navigational cards get a shadow. Data cards use a
        // hairline border + 2px left status border instead (§2 "Layout concept").
        nav: '0 1px 2px 0 rgb(18 22 28 / 0.06), 0 1px 3px 0 rgb(18 22 28 / 0.08)',
        popover: '0 4px 12px -2px rgb(18 22 28 / 0.12), 0 2px 4px -2px rgb(18 22 28 / 0.08)',
      },
      borderRadius: {
        DEFAULT: '0.25rem', // 4px — precise, ledger-like (not the generic 12px pill)
        md: '0.375rem',
        lg: '0.5rem',
      },
      transitionDuration: {
        'motion-1': '180ms',
        'motion-2': '320ms',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '0.85' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'skeleton-pulse': 'skeleton-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
