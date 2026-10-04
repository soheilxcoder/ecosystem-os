/**
 * MUST be the very first import of the live bundle.
 *
 * Bundled libraries (notably PGlite's Emscripten loader) sniff the runtime by
 * inspecting `process` — e.g. `typeof process.versions.node === 'string'` means
 * "we're on Node, use fs/fileURLToPath". In a real browser the injected process
 * polyfill is browser-safe, but some headless/rendering environments leak a real
 * Node `process` global, which flips those libraries onto their Node code path
 * and crashes with "The URL must be of scheme file".
 *
 * Mark any visible `process` as an Electron-style renderer BEFORE anything else
 * evaluates: `process.type === 'renderer'` forces the web code path everywhere.
 */

const g = globalThis as Record<string, unknown>;

function neutralize(proc: unknown): void {
  if (!proc || typeof proc !== 'object') return;
  const p = proc as Record<string, unknown>;
  p.type = 'renderer';
  if (!p.versions || typeof p.versions !== 'object') p.versions = {};
  const versions = p.versions as Record<string, unknown>;
  delete versions.node;
}

// Neutralize any already-present process global…
neutralize(g.process);

// …and guard the globalThis.process slot so anything assigned later (the build
// injects `globalThis.process = globalThis.process || polyfill` into modules)
// stays neutral too.
let current = g.process;
try {
  Object.defineProperty(g, 'process', {
    configurable: true,
    enumerable: false,
    get() {
      return current;
    },
    set(value: unknown) {
      neutralize(value);
      current = value;
    },
  });
} catch {
  // If the slot isn't configurable (unusual), the initial neutralize still helps.
}

export {};
