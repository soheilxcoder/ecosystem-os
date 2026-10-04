/**
 * Live edition build — the REAL platform (Fastify API + PGlite PostgreSQL)
 * compiled to run entirely inside the browser, hosted on GitHub Pages.
 *
 * Node built-ins are shimmed (live/shims), the `pg` driver is stubbed out
 * (embedded PGlite only), and migrations ship as bundled raw SQL.
 */
import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import fs from 'node:fs';
import path from 'node:path';

const shim = (name: string) => path.resolve(__dirname, `shims/${name}.ts`);

/**
 * Resolve Node subpath imports the polyfill plugin can't map
 * (`stream/promises` has no browserify counterpart) to inert stubs.
 */
function nodeSubpathStubs(debug = false): Plugin {
  const stubs: Record<string, string> = {
    'stream/promises': shim('stream-promises'),
    'node:stream/promises': shim('stream-promises'),
    'fs/promises': shim('node-fs-promises'),
    'node:fs/promises': shim('node-fs-promises'),
  };
  return {
    name: 'live:node-subpath-stubs',
    enforce: 'pre',
    resolveId: {
      order: 'pre',
      handler(source, importer) {
        if (debug && source.includes('stream')) {
          // eslint-disable-next-line no-console
          console.log(`[subpath-stubs] resolve ${JSON.stringify(source)} from ${importer ?? '-'}`);
        }
        const hit = stubs[source];
        if (hit) return hit;
        return null;
      },
    },
  };
}

/** live/index.html is emitted under live/ — hoist it to the dist root. */
function hoistIndexHtml(outDir: string): Plugin {
  return {
    name: 'live:hoist-index-html',
    apply: 'build',
    closeBundle() {
      const from = path.join(outDir, 'live', 'index.html');
      const to = path.join(outDir, 'index.html');
      if (!fs.existsSync(from)) return;
      fs.renameSync(from, to);
      fs.rmdirSync(path.join(outDir, 'live'));
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  // Served under https://<user>.github.io/ecosystem-os/live/
  base: '/ecosystem-os/live/',
  resolve: {
    alias: [
      { find: /^node:diagnostics_channel$/, replacement: shim('node-diagnostics_channel') },
      { find: /^node:async_hooks$/, replacement: shim('node-async_hooks') },
      { find: /^node:perf_hooks$/, replacement: shim('node-perf_hooks') },
      { find: /^node:fs$/, replacement: shim('node-fs') },
      { find: /^pg$/, replacement: shim('pg-stub') },
      { find: 'next/link', replacement: path.resolve(__dirname, '../demo/src/shims/link.tsx') },
      { find: 'next/navigation', replacement: path.resolve(__dirname, '../demo/src/shims/navigation.tsx') },
    ],
  },
  plugins: [
    nodeSubpathStubs(Boolean(process.env.LIVE_DEBUG)),
    nodePolyfills({
      overrides: {
        http: shim('node-http'),
        https: shim('node-https'),
        assert: shim('node-assert'),
        fs: shim('node-fs'),
      },
    }),
    hoistIndexHtml(path.resolve(__dirname, '..', 'live-dist')),
  ],
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'live-dist',
    emptyOutDir: true,
    target: 'esnext',
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  preview: {
    allowedHosts: true,
  },
});
