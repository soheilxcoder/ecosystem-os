#!/usr/bin/env node
/* ============================================================================
   tools/build-site.mjs — build the static GitHub Pages product

   What it does, in order:

     1. verify   every <script>/<link> referenced by site/index.html exists,
                 every JS file parses, and every route in app.js ROUTES has a
                 page module. A broken reference is a build failure, not a
                 blank screen shipped to the user.
     2. emit     site/** -> dist/**, with a content-hash cache-buster on every
                 asset URL so GitHub Pages' CDN cannot serve a stale bundle
                 after a deploy.
     3. routes   one HTML file per module (dashboard.html, pod.html, …) so a
                 clean URL works on Pages without any server rewrite. Each sets
                 window.ECO_ROUTE, which app.js already honours on boot.
     4. 404      dist/404.html boots the app on the notFound screen, so a bad
                 path lands in the product instead of a GitHub error page.
     5. nojekyll dist/.nojekyll, because Pages runs Jekyll by default and Jekyll
                 ignores paths beginning with an underscore.

   Usage:
     node tools/build-site.mjs            build into dist/
     node tools/build-site.mjs --check    verify only, write nothing (CI gate)
     node tools/build-site.mjs --out DIR  build into DIR

   No dependencies beyond Node. No network access. Nothing is fetched.
   ============================================================================ */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SITE = path.join(ROOT, 'site');
const ASSETS = path.join(SITE, 'assets');

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(ROOT, argv[outIdx + 1]) : path.join(ROOT, 'dist');

/* Page modules that are not routes: the fallback screen. */
const NON_ROUTE_PAGES = ['notFound'];

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* ------------------------------------------------------------------ read -- */
function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function exists(p) {
  return fs.existsSync(p);
}
function hash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

/* ------------------------------------------------------- 1. verification -- */

/** Every JS file under site/, so a stray or orphaned module is visible. */
function allJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out.sort();
}

function verify() {
  const indexHtml = path.join(SITE, 'index.html');
  if (!exists(indexHtml)) return fail('site/index.html is missing');
  const html = read(indexHtml);

  /* 1a. every referenced asset exists */
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^https?:|^mailto:|^data:/.test(u));
  for (const ref of refs) {
    const p = path.join(SITE, ref);
    if (!exists(p)) fail(`index.html references a missing file: ${ref}`);
  }

  /* 1b. every JS file parses */
  for (const f of allJs(SITE)) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (e) {
      fail(`syntax error in ${path.relative(ROOT, f)}:\n${String(e.stderr || e.message).trim()}`);
    }
  }

  /* 1c. every declared asset file is actually loaded */
  const loaded = new Set(refs.map((r) => path.resolve(SITE, r)));
  for (const f of allJs(SITE)) {
    if (!loaded.has(path.resolve(f))) warn(`${path.relative(ROOT, f)} is never loaded by index.html`);
  }

  /* 1d. every route has a page module, and the load order is the dependency
         order (app.js must follow the pages it renders). */
  const appJs = read(path.join(ASSETS, 'app.js'));
  const routes = [...appJs.matchAll(/\{\s*id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  if (!routes.length) fail('could not read ROUTES out of assets/app.js');

  const pagesDir = path.join(ASSETS, 'pages');
  const pageFiles = exists(pagesDir) ? fs.readdirSync(pagesDir) : [];
  for (const r of routes) {
    if (!pageFiles.includes(`${r}.js`)) fail(`route "${r}" has no page module assets/pages/${r}.js`);
  }
  for (const f of pageFiles) {
    const id = f.replace(/\.js$/, '');
    if (!routes.includes(id) && !NON_ROUTE_PAGES.includes(id)) {
      warn(`assets/pages/${f} is not referenced by any route`);
    }
  }
  if (!pageFiles.includes('notFound.js')) fail('assets/pages/notFound.js is missing');

  const scriptOrder = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const pos = (n) => scriptOrder.indexOf(`assets/${n}`);
  if (pos('app.js') < 0) fail('index.html does not load assets/app.js');
  if (pos('actions.js') < 0) fail('index.html does not load assets/actions.js');
  if (pos('app.js') > pos('actions.js')) fail('assets/app.js must load before assets/actions.js');
  for (const f of pageFiles) {
    const i = pos(`pages/${f}`);
    if (i < 0) fail(`index.html does not load assets/pages/${f}`);
    else if (i > pos('app.js')) fail(`assets/pages/${f} must load before assets/app.js`);
  }
  for (const dep of ['icons.js', 'i18n.js', 'domain.js', 'data.js', 'store.js', 'components.js', 'diagrams.js', 'helpers.js']) {
    if (pos(dep) < 0) fail(`index.html does not load assets/${dep}`);
    else if (pos(dep) > pos('pages/dashboard.js')) fail(`assets/${dep} must load before the page modules`);
  }

  /* 1e. no third-party requests anywhere — the brief forbids CDNs outright. */
  for (const f of [...allJs(SITE), indexHtml, path.join(ASSETS, 'eco.css')]) {
    if (!exists(f)) continue;
    const src = read(f);
    const remote = [...src.matchAll(/https?:\/\/(?!localhost|127\.0\.0\.1)([a-z0-9.-]+)/gi)]
      .map((m) => m[1])
      .filter((h) => !h.includes('github.com') && !h.includes('githubusercontent') && !h.includes('w3.org') && !h.includes('example.'));
    for (const h of new Set(remote)) {
      /* Google Calendar links are user-initiated navigation, not a fetch. */
      if (h === 'calendar.google.com') continue;
      warn(`${path.relative(ROOT, f)} references an external host: ${h}`);
    }
    const cdn = /<link[^>]+href="https?:\/\/|<script[^>]+src="https?:\/\//i;
    if (path.extname(f) === '.html' && cdn.test(src)) fail(`${path.relative(ROOT, f)} loads a remote asset`);
  }

  /* 1f. every data-action used in markup has a handler somewhere. */
  const handlers = new Set();
  for (const f of [path.join(ASSETS, 'app.js'), path.join(ASSETS, 'actions.js')]) {
    if (!exists(f)) continue;
    /* `(?<![A-Za-z.])` so ECO.icon('nav-pod') is not mistaken for a handler. */
    for (const m of read(f).matchAll(/(?<![A-Za-z.])on\('([a-z0-9-]+)'/g)) handlers.add(m[1]);
  }
  const used = new Set();
  for (const f of allJs(SITE)) {
    for (const m of read(f).matchAll(/data-action="([a-z0-9-]+)"/g)) used.add(m[1]);
  }
  for (const a of [...used].sort()) {
    if (!handlers.has(a)) fail(`data-action="${a}" is rendered but has no handler`);
  }
  /* Handlers whose markup is assembled at call time rather than sitting in a
     page module: the shell's own chrome, dialog continuations, and the two
     helpers that build their own controls. */
  const DYNAMIC_ACTIONS = new Set([
    'lang', 'persona', 'provenance', 'modal-close', 'tab', 'sort', 'step-toggle',
    'reload', 'reset-demo', 'reset-demo-confirm', 'rotation-history',
    'pick-pod', 'budget-breakdown', 'phase-detail', 'pod-open', 'agreement-detail',
    'confirm-submit-pitch', 'confirm-submit-review', 'confirm-lock-budget',
    'confirm-escalate', 'confirm-advance-stage', 'confirm-entry-decision',
    'confirm-panel-vote', 'confirm-pilot-decision', 'confirm-publish-report',
    'cast-vote', 'save-priorities', 'submit-checkin', 'agr-respond',
    'submit-session', 'submit-reassign', 'submit-rule',
  ]);
  for (const a of [...handlers].sort()) {
    if (!used.has(a) && !DYNAMIC_ACTIONS.has(a)) warn(`handler "${a}" is registered but never rendered`);
  }

  /* 1g. every literal i18n key in every module exists in the dictionary.
         A missing string renders as its own key, which is visible but wrong,
         so this is a build failure rather than a warning. Keys built by string
         concatenation (t('coa.type' + x)) are skipped — they are checked by
         tools/smoke-site.cjs at render time instead. */
  const dict = read(path.join(ASSETS, 'i18n.js'));
  const dictKeys = new Set([...dict.matchAll(/^\s*'([A-Za-z0-9_.]+)':\s*\[/gm)].map((m) => m[1]));
  if (dictKeys.size < 100) fail('could not parse the i18n dictionary');
  const usedKeys = new Map();
  for (const f of allJs(SITE)) {
    if (f.endsWith('i18n.js')) continue;
    for (const m of read(f).matchAll(/(?:ECO\.)?\bt\(\s*'([A-Za-z0-9_.]+)'/g)) {
      const k = m[1];
      /* Skip dynamic prefixes: the literal is only part of the real key. */
      if (/\.(type|stage|dec|st|capacity|level|tone|group|use|ap|do|moment|flow|rel|preset|channel|h)$/.test(k)) continue;
      /* A bare prefix or a one-letter fragment is a concatenation, not a key. */
      if (k.endsWith('.') || k.split('.').pop().length < 2) continue;
      if (!usedKeys.has(k)) usedKeys.set(k, path.relative(ROOT, f));
    }
  }
  for (const [k, f] of [...usedKeys].sort()) {
    if (!dictKeys.has(k)) fail(`i18n key "${k}" is used in ${f} but missing from assets/i18n.js`);
  }

  return routes;
}

/* ------------------------------------------------------------- 2. emit -- */
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Content hash per asset, so a changed file busts its own cache entry only. */
function cacheMap() {
  const map = new Map();
  for (const f of allJs(SITE).concat([path.join(ASSETS, 'eco.css'), path.join(ASSETS, 'favicon.svg'), path.join(ASSETS, 'site.webmanifest')])) {
    if (!exists(f)) continue;
    const rel = path.relative(SITE, f).split(path.sep).join('/');
    map.set(rel, hash(read(f)));
  }
  return map;
}

function stampHtml(html, map) {
  return html.replace(/(src|href)="(assets\/[^"?#]+)"/g, (whole, attr, rel) => {
    const v = map.get(rel);
    return v ? `${attr}="${rel}?v=${v}"` : whole;
  });
}

/* ------------------------------------------------------------ 3. routes -- */
function routeHtml(baseHtml, routeId) {
  /* Runs against the cache-busted HTML, so match the stamped URL rather than
     the bare source path — otherwise the injection silently does nothing. */
  const tag = /<script src="assets\/icons\.js[^"]*"><\/script>/;
  if (!tag.test(baseHtml)) throw new Error('could not find the icons.js tag to inject ECO_ROUTE before');
  return baseHtml.replace(tag, `<script>window.ECO_ROUTE = ${JSON.stringify(routeId)};</script>\n$&`);
}

/* --------------------------------------------------------------- build -- */
const routes = verify();

if (errors.length) {
  console.error('\nBUILD FAILED\n');
  for (const e of errors) console.error('  ✗ ' + e);
  for (const w of warnings) console.warn('  ! ' + w);
  process.exit(1);
}

if (!CHECK_ONLY) {
  fs.rmSync(OUT, { recursive: true, force: true });
  copyTree(SITE, OUT);

  const map = cacheMap();
  const baseHtml = stampHtml(read(path.join(SITE, 'index.html')), map);
  fs.writeFileSync(path.join(OUT, 'index.html'), baseHtml);

  /* One clean URL per module. */
  for (const r of routes) {
    fs.writeFileSync(path.join(OUT, `${r}.html`), routeHtml(baseHtml, r));
  }

  /* A bad path boots the product on its notFound screen. */
  fs.writeFileSync(path.join(OUT, '404.html'), routeHtml(baseHtml, 'notFound'));

  /* Pages runs Jekyll unless told otherwise. */
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  fs.writeFileSync(
    path.join(OUT, 'asset-manifest.json'),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        routes,
        assets: Object.fromEntries([...map.entries()].sort()),
      },
      null,
      2,
    ) + '\n',
  );
}

const jsFiles = allJs(SITE);
const totalBytes = jsFiles
  .concat([path.join(ASSETS, 'eco.css'), path.join(SITE, 'index.html')])
  .filter(exists)
  .reduce((n, f) => n + fs.statSync(f).size, 0);

console.log(`\n${CHECK_ONLY ? 'VERIFY OK' : 'BUILD OK'}`);
console.log(`  routes      ${routes.length}  (${routes.join(', ')})`);
console.log(`  modules     ${jsFiles.length} JS files`);
console.log(`  payload     ${(totalBytes / 1024).toFixed(1)} KB uncompressed, no dependencies, no network`);
if (!CHECK_ONLY) {
  console.log(`  output      ${path.relative(ROOT, OUT)}/`);
  console.log(`  deep links  ${routes.length + 2} HTML files (index, ${routes.length} modules, 404)`);
}
for (const w of warnings) console.warn('  ! ' + w);
console.log('');
