import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Type — 12-DESIGN-SYSTEM.md §2.
 *
 *  - Display face: Source Serif 4 — a high-contrast, ledger-like serif for
 *    section headings and hero numbers only.
 *  - UI face: Inter — a grotesque sans with excellent tabular figures for body
 *    text, labels, buttons and tables.
 *
 * Fonts are self-hosted from npm rather than fetched from Google Fonts at build
 * time: the build stays reproducible and offline-capable, and there is no
 * render-blocking request to a third party.
 */
import '@fontsource-variable/inter';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';

export const metadata: Metadata = {
  title: 'Ecosystem OS',
  description: 'Operating platform for the self-governing ecosystem model',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper-100 font-sans text-ink-950 antialiased">
        {children}
      </body>
    </html>
  );
}
