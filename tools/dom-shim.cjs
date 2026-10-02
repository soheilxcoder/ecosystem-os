/* Minimal DOM shim so the static site's render functions can be exercised in
   Node. Only what the modules actually touch. */
function makeEl(tag) {
  var el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [], childNodes: [], dataset: {}, style: {}, attributes: {},
    innerHTML: '', textContent: '', value: '', hidden: false, className: '',
    parentNode: null, ownerDocument: null,
    setAttribute: function (k, v) { this.attributes[k] = String(v); },
    getAttribute: function (k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    hasAttribute: function (k) { return k in this.attributes; },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); this.childNodes.push(c); return c; },
    removeChild: function (c) {
      var i = this.children.indexOf(c);
      if (i >= 0) { this.children.splice(i, 1); this.childNodes.splice(i, 1); c.parentNode = null; }
      return c;
    },
    insertBefore: function (c) { return this.appendChild(c); },
    addEventListener: function () {}, removeEventListener: function () {},
    querySelector: function (sel) { var e = makeEl('div'); e._selector = sel; e.selectionStart = 0; e.setSelectionRange = function () {}; return e; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {}, blur: function () {}, click: function () {},
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    contains: function () { return false; },
    scrollIntoView: function () {},
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
  };
  Object.defineProperty(el, 'firstChild', { get: function () { return this.children[0] || null; } });
  Object.defineProperty(el, 'firstElementChild', { get: function () { return this.children[0] || null; } });
  return el;
}

var listeners = {};
/* Elements the shell writes into, keyed by id. Returning a real (if inert)
   node means renderSidebar / renderTopbar / renderContent actually execute
   under Node instead of early-returning, so shell bugs surface here too. */
var byId = {};
function elById(id) {
  if (!byId[id]) { byId[id] = makeEl('div'); byId[id].id = id; document.body.appendChild(byId[id]); }
  return byId[id];
}
/* Stub nodes for the handful of CSS selectors the shell and actions query. */
var bySelector = {};
function elBySelector(sel) {
  if (!bySelector[sel]) {
    var e = makeEl('div');
    e._selector = sel;
    e.selectionStart = 0;
    e.setSelectionRange = function () {};
    bySelector[sel] = e;
  }
  return bySelector[sel];
}

var document = {
  readyState: 'complete',
  documentElement: makeEl('html'),
  body: makeEl('body'),
  head: makeEl('head'),
  createElement: makeEl,
  createTextNode: function (t) { var e = makeEl('#text'); e.textContent = t; return e; },
  createDocumentFragment: function () { return makeEl('#fragment'); },
  addEventListener: function (k, fn) { (listeners[k] = listeners[k] || []).push(fn); },
  removeEventListener: function (k, fn) {
    if (listeners[k]) listeners[k] = listeners[k].filter(function (f) { return f !== fn; });
  },
  getElementById: function (id) { return elById(id); },
  querySelector: function (sel) { return elBySelector(sel); },
  querySelectorAll: function () { return []; },
  execCommand: function () { return true; },
  title: '',
  dir: 'rtl',
};
document.documentElement.setAttribute('lang', 'fa');

var store = {};
var window = {
  document: document,
  listeners: listeners,
  localStorage: {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
  },
  addEventListener: function () {}, removeEventListener: function () {},
  matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
  scrollTo: function () {},
  requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
  getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
  location: {
    hash: '', href: 'https://example.test/', pathname: '/', search: '', origin: 'https://example.test',
    replace: function (u) { if (String(u).charAt(0) === '#') this.hash = String(u); else this.href = String(u); },
    assign: function (u) { this.replace(u); },
    reload: function () {},
  },
  navigator: { language: 'fa-IR', userAgent: 'node' },
  history: { pushState: function () {}, replaceState: function () {} },
  alert: function () {}, confirm: function () { return true; },
  URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} },
  Blob: function (parts, opts) { this.parts = parts; this.opts = opts; },
  setTimeout: setTimeout, clearTimeout: clearTimeout,
};
window.window = window;
window.self = window;
window.top = window;
window.parent = window;
window.globalThis = globalThis;

module.exports = { window: window, document: document, makeEl: makeEl, elById: elById, byId: byId };
