/**
 * Static showcase build (GitHub Pages edition).
 *
 * Bundles the REAL design system — app/globals.css, tailwind.config.ts,
 * @fontsource fonts and the production React components — into a fully static
 * SPA with sample data. `next/link` and `next/navigation` are aliased to tiny
 * hash-router shims; nothing else from Next is used.
 */
import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The entry HTML lives in demo/ (so the repo root stays clean), but Pages
 * serves dist from its own root — so move the emitted demo/index.html up one
 * level after the bundle is written.
 */
function hoistIndexHtml(outDir: string): Plugin {
  return {
    name: 'demo:hoist-index-html',
    apply: 'build',
    closeBundle() {
      const from = path.join(outDir, 'demo', 'index.html');
      const to = path.join(outDir, 'index.html');
      if (!fs.existsSync(from)) return;
      fs.renameSync(from, to);
      fs.rmdirSync(path.join(outDir, 'demo'));
    },
  };
}

export default defineConfig({
  plugins: [hoistIndexHtml(path.resolve(__dirname, '..', 'demo-dist'))],
  root: path.resolve(__dirname, '..'),
  // Pages serves this repo under /ecosystem-os/.
  base: '/ecosystem-os/',
  resolve: {
    alias: {
      'next/link': path.resolve(__dirname, 'src/shims/link.tsx'),
      'next/navigation': path.resolve(__dirname, 'src/shims/navigation.tsx'),
    },
  },
  esbuild: {
    // The repo tsconfig says "preserve" (Next compiles JSX itself); the static
    // build needs real output, so use the automatic runtime instead.
    jsx: 'automatic',
  },
  build: {
    outDir: 'demo-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  preview: {
    // The sandbox preview runs behind a proxied host; allow any of them.
    allowedHosts: true,
  },
});
