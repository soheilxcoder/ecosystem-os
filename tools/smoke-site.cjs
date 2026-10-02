#!/usr/bin/env node
/* ============================================================================
   tools/smoke-site.cjs

   Renders every static-site screen for every role persona, in both languages,
   inside a minimal DOM shim, and reports:

     1. thrown errors            — a screen that would fall back to errorBox
     2. untranslated keys        — ECO.t fell back to returning the key
     3. unknown icon names       — ECO.icon returned ''
     4. suspicious markup        — "undefined", "NaN", "[object Object]"
     5. escaped markup           — HTML that reached the screen as text, so
                                   the control is visible but inert
     6. unsubstituted i18n params — a literal {d} or {n} shown to the user
     7. design-system violations — the anti-patterns 12-DESIGN-SYSTEM §1
                                   refuses, plus Latin digits inside Persian
                                   prose (§2 requires one numeral system per
                                   locale)

   Run:  node tools/smoke-site.cjs [--lang fa|en] [--route dashboard]
   Exit: 0 when clean, 1 otherwise (usable as a CI gate).

   This is a static analysis harness, not a browser test: it catches the class
   of bug that actually breaks a data-shaped UI (wrong field names, missing
   dictionary entries) without needing a headless browser.
   ============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'site', 'assets');

/* The load order is read OUT OF index.html rather than duplicated here, so the
   harness can never drift from what a browser actually executes. A page module
   that depends on a later file fails here exactly as it would in production. */
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
const FILES = [...INDEX_HTML.matchAll(/<script src="(assets\/[^"?#]+)"/g)].map((m) => m[1].replace(/^assets\//, ''));
if (FILES.length < 20) {
  console.error('could not read the script list out of site/index.html');
  process.exit(1);
}

/* --------------------------------------------------------------- shim -- */
const shim = require('./dom-shim.cjs');
const sandbox = Object.assign(Object.create(null), shim.window);
/* The shim's own `window` was copied in above; rebind it so `typeof window`
   inside the assets resolves to THIS context and ECO lands where we can read
   it. Without this every module silently decorates the shim instead. */
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;
sandbox.console = console;
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = () => 0;
sandbox.clearInterval = () => {};
sandbox.Date = Date;
sandbox.Math = Math;
sandbox.JSON = JSON;
sandbox.String = String;
sandbox.Number = Number;
sandbox.Array = Array;
sandbox.Object = Object;
sandbox.Boolean = Boolean;
sandbox.RegExp = RegExp;
sandbox.Error = Error;
sandbox.Map = Map;
sandbox.Set = Set;
sandbox.Symbol = Symbol;
sandbox.Promise = Promise;
sandbox.parseInt = parseInt;
sandbox.parseFloat = parseFloat;
sandbox.isNaN = isNaN;
sandbox.encodeURIComponent = encodeURIComponent;
sandbox.decodeURIComponent = decodeURIComponent;
/* Defer app.js boot() until every page module exists; the shell would
   otherwise render the current route against a half-loaded ECO.pages. */
sandbox.document.readyState = 'loading';
vm.createContext(sandbox);

for (const f of FILES) {
  const p = path.join(ASSETS, f);
  if (!fs.existsSync(p)) {
    console.error('MISSING FILE: ' + f);
    process.exit(1);
  }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  } catch (err) {
    console.error('LOAD FAILED: ' + f + '\n  ' + err.stack);
    process.exit(1);
  }
}

const ECO = sandbox.ECO;
const S = ECO.store;
const d = ECO.domain;

/* ----------------------------------------------------- instrumentation -- */
const missingKeys = new Set();
const missingIcons = new Set();
const origT = ECO.t;
ECO.t = function (key, vars, lang) {
  const out = origT(key, vars, lang);
  if (out === key && String(key).indexOf('.') > 0) missingKeys.add(key);
  return out;
};
const origIcon = ECO.icon;
ECO.icon = function (name, opts) {
  const out = origIcon(name, opts);
  if (!out && name) missingIcons.add(name);
  return out;
};

/* ------------------------------------------------------- route matrix -- */
const pods = S.state.db.pods.map((p) => p.id);
const agreements = S.state.db.agreements.map((a) => a.id);
const cycle = S.currentCycle();
const reviewSubs = ['queue', 'accountability', 'entry', 'governance', 'rules'];
const trialIds = S.state.db.entryTrials.map((t) => t.podId);
const caseIds = S.state.db.accountabilityCases.map((c) => c.id)
  .concat(S.state.db.conflictCases.map((c) => c.id));

const ROUTES = [
  'dashboard',
  ...pods.map((id) => 'pod/' + id),
  'pod/' + pods[0] + '/pitch',
  'pod/' + pods[0] + '/history',
  'agreements',
  ...agreements.slice(0, 6).map((id) => 'agreements/' + id),
  'agreements/graph',
  'budget',
  ...pods.map((id) => 'budget/' + id),
  'budget/history',
  'budget/simulator',
  'budget/market',
  'calendar',
  'calendar/weekly',
  'calendar/export',
  'calendar/config',
  ...pods.slice(0, 3).map((id) => 'calendar/' + id),
  'coaching',
  ...pods.slice(0, 4).map((id) => 'coaching/' + id),
  'review',
  ...reviewSubs.map((s) => 'review/' + s),
  ...trialIds.map((id) => 'review/entry/' + id),
  ...caseIds.map((id) => 'review/case/' + id),
  'hub',
  'hub/architecture',
  'hub/deployment',
  'hub/coaching',
  'hub/strategic',
  'hub/pilots',
  'hub/investor',
  'investor',
  'investor/company',
  'investor/holding/h-pars',
  'investor/holding/h-nova',
  'investor/pod/' + pods[0],
  'investor/report/ir-1',
  'investor/report/ir-3',
  'design-system',
  ...['colour', 'type', 'components', 'diagrams', 'icons', 'motion', 'antipatterns'].map((s) => 'design-system/' + s),
  'archive',
  'archive/search',
  'archive/lessons',
  'notifications',
  'notifications/prefs',
  'settings',
  'settings/day-travel',
  'no-such-route',
];

/* --------------------------------------------------------------- run -- */
const argv = process.argv.slice(2);
const onlyLang = (() => { const i = argv.indexOf('--lang'); return i >= 0 ? argv[i + 1] : null; })();
const onlyRoute = (() => { const i = argv.indexOf('--route'); return i >= 0 ? argv[i + 1] : null; })();
const langs = onlyLang ? [onlyLang] : ['fa', 'en'];
const personas = S.state.db.personas ? S.state.db.personas : ECO.SEED.personas;

/* ------------------------------------------------- design-system gate --
   12-DESIGN-SYSTEM §1 lists the anti-patterns this product refuses, and §2
   requires one numeral system per locale. Both are checkable against rendered
   output, so they are checked here rather than left to review.

   Text is extracted from the markup first: an href of "#/pod/p-atlas" or a
   token of "--ink-950" is code, not copy, and must not be flagged. */
const ARABIC = '\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF';
const PERSIAN_DIGITS = '\\u06F0-\\u06F9';

/** Latin numerals that are legitimately Latin even inside a Persian sentence:
    spec filenames and section numbers, CSS tokens and values, audit hashes,
    and formula notation. Anything else in Persian prose is a bug. */
const LATIN_OK = [
  /[0-9]{1,2}-(?:DESIGN-SYSTEM|VISUAL-ASSETS|MODULE|OVERVIEW|INFORMATION|TECHNICAL|ROADMAP|BUSINESS)/,
  /§\s?[0-9](?:\.[0-9])*/,
  /--[a-z]+-[0-9]{2,4}/,
  /#[0-9A-Fa-f]{6}/,
  /[0-9]+(?:px|ms|rem|em|vh|vw|%|×)/,
  /ECO-[0-9A-Z]{4}-[0-9A-Z]{4}/,
  /cubic-bezier\([^)]*\)/,
  /\b[0-9]{1,3}(?:\/[0-9]{1,3}){1,3}\b/,           /* 40/35/25, 24x24 grids */
  /\bstroke [0-9.]+/,
  /\b[0-9]+\.[0-9]+\b(?=\s*[×=+\/)])/,              /* formula operands */
  /[=(+]\s?[0-9.]+/,
];

/**
 * Text is extracted PER ELEMENT rather than from the whole document. Flattening
 * the markup makes two adjacent table cells read as one sentence, which turns a
 * legitimate empty-value marker in its own <td> into a fake "WORD — fragment"
 * label. Checking each element's own text keeps the gate honest.
 */
function textFragments(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .split(/<[^>]*>/)
    .map((f) => f.replace(/&[a-zA-Z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((f) => f.length > 0);
}

function allowedLatin(token, around) {
  return LATIN_OK.some((re) => re.test(token) || re.test(around));
}

/** Returns a list of human-readable violations found in one rendered screen. */
function designViolations(html, lang) {
  const out = [];
  const seen = new Set();
  const flag = (kind, frag, at) => {
    const msg = kind + ': ' + frag.slice(Math.max(0, at - 34), at + 40);
    if (!seen.has(msg)) { seen.add(msg); out.push(msg); }
  };

  /* Markup that reached the screen escaped. A table column holding HTML without
     `raw: true`, or a string passed through esc() twice, renders as literal
     source instead of as an element — the button is there but does nothing. */
  const escapedTag = html.match(/&(?:lt|#60);\s?(?:a|span|div|button|strong|em|b|i|svg|table|thead|tbody|tr|td|th|p|ul|ol|li|dl|dt|dd|h[1-6])\b/i);
  if (escapedTag) {
    const at = html.indexOf(escapedTag[0]);
    out.push('escaped markup rendered as text: ' +
      html.slice(Math.max(0, at - 60), at + 90).replace(/\s+/g, ' '));
  }

  /* An i18n string whose parameters were never substituted. Calling
     ECO.t(key, null, lang) on a key that carries {d} or {n} puts the literal
     placeholder on screen — the sentence renders, so nothing throws, and the
     user reads "Rotates to a new coach around {d}". */
  for (const frag of textFragments(html)) {
    /* A `{podId}` after a slash is a documented route pattern on the 404
       screen, not a missing parameter — those are meant to be read literally. */
    const ph = frag.match(/(^|[^/\w])\{[a-zA-Z_][a-zA-Z0-9_]*\}/);
    if (ph) {
      const at = frag.indexOf(ph[0]) + ph[1].length;
      out.push('unsubstituted i18n placeholder: ' + frag.slice(Math.max(0, at - 40), at + 44));
    }
  }

  for (const frag of textFragments(html)) {
    /* §1 — middle-dot-joined meta strings. */
    const dot = frag.indexOf('\u00B7');
    if (dot >= 0) flag('middle-dot-joined meta string', frag, dot);

    /* §1 — em-dash "WORD — fragment" labels. A lone dash standing in for an
       absent value is a data-grid convention, not a label, so both sides must
       carry a letter for this to fire. */
    const em = frag.match(new RegExp('[\\p{L}] \\u2014 [\\p{L}]', 'u'));
    if (em) flag('em-dash label', frag, frag.indexOf(em[0]));

    if (lang !== 'fa') continue;

    /* §2 — one numeral system per locale. A Latin digit run touching Persian
       script means a number reached the screen without going through
       ECO.domain (groupNumber / num / pct / outOf / formatDate). */
    const re = new RegExp('([' + ARABIC + '][^' + ARABIC + ']{0,3})?([0-9][0-9.,:%/\u2212\\-]*)([^' + ARABIC + ']{0,3}[' + ARABIC + '])?', 'g');
    let m;
    while ((m = re.exec(frag)) !== null) {
      const touchesPersian = Boolean(m[1] || m[3]);
      const alreadyLocal = new RegExp('[' + PERSIAN_DIGITS + ']').test(m[0]);
      const around = frag.slice(Math.max(0, m.index - 26), m.index + m[0].length + 26);
      if (touchesPersian && !alreadyLocal && !allowedLatin(m[2], around)) {
        flag('Latin digits in Persian prose', frag, m.index);
      }
      re.lastIndex = m.index + Math.max(1, m[0].length);
    }
  }
  return out;
}

const designErrors = [];

const errors = [];
const badMarkup = [];
const suspicious = /undefined|NaN|\[object Object\]|Infinity/;

let renders = 0;
for (const persona of personas) {
  for (const lang of langs) {
    S.setState({ personaId: persona.id, lang });
    for (const route of ROUTES) {
      if (onlyRoute && route !== onlyRoute && route.indexOf(onlyRoute + '/') !== 0) continue;
      const parts = route.split('/');
      const rt = { route: parts[0], param: parts[1] || null, sub: parts[2] || null };
      const page = ECO.pages[rt.route] || ECO.pages.notFound;
      if (!page) { errors.push([persona.id, lang, route, 'no page module']); continue; }
      let html = '';
      try {
        html = page.render(rt, lang);
        renders++;
      } catch (err) {
        errors.push([persona.id, lang, route, err.message + '\n      ' + String(err.stack).split('\n').slice(1, 4).join('\n      ')]);
        continue;
      }
      if (typeof html !== 'string') { errors.push([persona.id, lang, route, 'render returned ' + typeof html]); continue; }
      if (!html.trim()) { errors.push([persona.id, lang, route, 'render returned empty markup']); continue; }
      const m = html.match(new RegExp(suspicious.source, 'g'));
      if (m) badMarkup.push([persona.id, lang, route, [...new Set(m)].join(', ')]);
      for (const v of designViolations(html, lang)) designErrors.push([persona.id, lang, route, v]);
    }
  }
}

/* Also exercise the title/crumb hooks the shell calls. */
for (const persona of personas) {
  for (const lang of langs) {
    S.setState({ personaId: persona.id, lang });
    for (const route of ROUTES) {
      const parts = route.split('/');
      const rt = { route: parts[0], param: parts[1] || null, sub: parts[2] || null };
      const page = ECO.pages[rt.route] || ECO.pages.notFound;
      if (!page) continue;
      try { if (page.title) page.title(rt, lang); } catch (e) { errors.push([persona.id, lang, route + ' (title)', e.message]); }
      try { if (page.crumb) page.crumb(rt, lang); } catch (e) { errors.push([persona.id, lang, route + ' (crumb)', e.message]); }
    }
  }
}

/* ------------------------------------------------------- shell boot --
   The render loop above calls the page modules directly. This second pass
   drives the real shell — boot(), the hash router, the sidebar, the topbar,
   the tab bar and the cycle meter — so a bug in app.js is caught here too.
   The shim now returns real nodes for getElementById, so renderContent's
   errorBox fallback becomes observable. */
const shellErrors = [];
sandbox.document.readyState = 'complete';
sandbox.window.location.hash = '#/dashboard';
try {
  ECO.app.boot();
} catch (err) {
  shellErrors.push(['boot', '-', '-', err.message]);
}

for (const persona of personas) {
  for (const lang of langs) {
    S.setState({ personaId: persona.id, lang });
    for (const route of ROUTES) {
      if (onlyRoute && route !== onlyRoute && route.indexOf(onlyRoute + '/') !== 0) continue;
      sandbox.window.location.hash = '#/' + route;
      try {
        ECO.app.render();
      } catch (err) {
        shellErrors.push([persona.id, lang, route, err.message]);
        continue;
      }
      const content = shim.elById('content');
      const html = content ? content.innerHTML : '';
      if (!html) { shellErrors.push([persona.id, lang, route, 'shell produced no content']); continue; }
      /* Only a page that IS an error box counts. The design-system screen
         renders one on purpose, as a specimen of the error state. */
      if (/^\s*<div class="error-box"/.test(html)) {
        const msg = (html.match(/error-box[^>]*>([^<]*)/) || [, ''])[1];
        shellErrors.push([persona.id, lang, route, 'shell fell back to errorBox: ' + msg.trim()]);
      }
      /* The chrome must have been painted too. */
      for (const id of ['nav', 'topbar', 'tabbar', 'sidebar-foot']) {
        if (!shim.elById(id).innerHTML) shellErrors.push([persona.id, lang, route, 'shell left #' + id + ' empty']);
      }
    }
  }
}

/* ------------------------------------------------------------- report -- */
function group(rows) {
  const by = new Map();
  for (const [p, l, r, msg] of rows) {
    const key = r + ' :: ' + msg;
    if (!by.has(key)) by.set(key, { route: r, msg, personas: new Set(), langs: new Set() });
    by.get(key).personas.add(p);
    by.get(key).langs.add(l);
  }
  return [...by.values()];
}

const errGroups = group(errors);
const badGroups = group(badMarkup);
const shellGroups = group(shellErrors);
const designGroups = group(designErrors);

console.log('renders: ' + renders +
  '  personas: ' + personas.length +
  '  routes: ' + ROUTES.length +
  '  langs: ' + langs.length);

if (errGroups.length) {
  console.log('\n=== RENDER ERRORS (' + errGroups.length + ') ===');
  for (const g of errGroups) {
    console.log('  #' + g.route + '  [langs: ' + [...g.langs].join(',') + ']  [personas: ' + g.personas.size + ']');
    console.log('    ' + g.msg);
  }
}

if (shellGroups.length) {
  console.log('\n=== SHELL ERRORS (' + shellGroups.length + ') ===');
  for (const g of shellGroups) {
    console.log('  #' + g.route + '  [langs: ' + [...g.langs].join(',') + ']  [personas: ' + g.personas.size + ']');
    console.log('    ' + g.msg);
  }
}

if (badGroups.length) {
  console.log('\n=== SUSPICIOUS MARKUP (' + badGroups.length + ') ===');
  for (const g of badGroups) console.log('  #' + g.route + '  ' + g.msg);
}

if (designGroups.length) {
  console.log('\n=== DESIGN-SYSTEM VIOLATIONS (' + designGroups.length + ') ===');
  for (const g of designGroups) {
    console.log('  #' + g.route + '  [langs: ' + [...g.langs].join(',') + ']  [personas: ' + g.personas.size + ']');
    console.log('    ' + g.msg);
  }
}

if (missingKeys.size) {
  console.log('\n=== MISSING i18n KEYS (' + missingKeys.size + ') ===');
  for (const k of [...missingKeys].sort()) console.log('  ' + k);
}

if (missingIcons.size) {
  console.log('\n=== MISSING ICONS (' + missingIcons.size + ') ===');
  for (const k of [...missingIcons].sort()) console.log('  ' + k);
}

const clean = !errGroups.length && !badGroups.length && !shellGroups.length &&
  !designGroups.length &&
  !missingKeys.size && !missingIcons.size;
console.log('\n' + (clean ? 'SMOKE OK' : 'SMOKE FAILED'));
process.exit(clean ? 0 : 1);
