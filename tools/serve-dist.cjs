#!/usr/bin/env node
/* ============================================================================
   tools/serve-dist.cjs

   A static server for dist/ that behaves the way GitHub Pages behaves.

   `python3 -m http.server` is not a stand-in for Pages: it 404s on /budget
   even though budget.html exists, so deep links look broken locally and work
   in production. Pages resolves an extensionless path to the matching .html
   file, and that rule beats the folder redirect. It also serves 404.html for
   anything missing. This does both, so what you test is what ships.

   Run:  node tools/serve-dist.cjs [port]     (default 4173)
   ============================================================================ */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing — run `node tools/build-site.mjs` first.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve a URL path to a file, the way Pages does. */
function resolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch (e) {
    return null;
  }
  if (!p.startsWith('/')) return null;

  const full = path.join(DIST, p);
  /* Refuse to escape dist/ however the path is spelled. */
  if (full !== DIST && !full.startsWith(DIST + path.sep)) return null;

  const candidates = [];
  if (p.endsWith('/')) candidates.push(path.join(full, 'index.html'));
  else {
    candidates.push(full);                       /* exact file */
    candidates.push(full + '.html');             /* /budget -> budget.html */
    candidates.push(path.join(full, 'index.html')); /* /budget/ -> budget/index.html */
  }
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* try the next */ }
  }
  return null;
}

function send(res, file, status) {
  const body = fs.readFileSync(file);
  res.writeHead(status, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': body.length,
    /* The build stamps assets with ?v=<hash>, so they can be cached hard while
       HTML must always be revalidated or a deploy looks like it did nothing. */
    'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(body);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    return res.end('405');
  }
  const file = resolve(req.url);
  if (file) return send(res, file, 200);

  const notFound = path.join(DIST, '404.html');
  if (fs.existsSync(notFound)) return send(res, notFound, 404);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404');
}).listen(PORT, '0.0.0.0', () => {
  console.log('serving dist/ the way GitHub Pages would');
  console.log('  http://localhost:' + PORT + '/');
  console.log('  http://localhost:' + PORT + '/budget          <- budget.html');
  console.log('  http://localhost:' + PORT + '/design-system   <- design-system.html');
  console.log('  http://localhost:' + PORT + '/no-such-page    <- 404.html');
});
