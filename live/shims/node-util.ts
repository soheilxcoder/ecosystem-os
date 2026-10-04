/** Minimal browser shim for the node:util surface Fastify and friends use. */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function format(fmt: unknown, ...args: unknown[]): string {
  if (typeof fmt !== 'string') {
    return [fmt, ...args].map((a) => (typeof a === 'string' ? a : inspect(a))).join(' ');
  }
  let i = 0;
  let out = fmt.replace(/%[sdifjo%]/g, (token) => {
    if (token === '%%') return '%';
    const value = args[i++];
    switch (token) {
      case '%s': return String(value);
      case '%d': case '%i': return String(parseInt(String(value), 10));
      case '%f': return String(parseFloat(String(value)));
      case '%j': return JSON.stringify(value);
      case '%o': return inspect(value);
      default: return String(value);
    }
  });
  while (i < args.length) {
    const value = args[i++];
    out += ` ${typeof value === 'string' ? value : inspect(value)}`;
  }
  return out;
}

export function inspect(value: unknown, _opts?: unknown): string {
  try {
    if (typeof value === 'string') return `'${value}'`;
    if (value instanceof Error) return `[${value.name}: ${value.message}]`;
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function deprecate<T extends (...args: any[]) => unknown>(fn: T, _message: string): T {
  return fn;
}

export function inherits(ctor: any, superCtor: any): void {
  if (ctor && superCtor) {
    ctor.super_ = superCtor;
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
  }
}

export function promisify(fn: (...args: any[]) => any): (...args: any[]) => Promise<any> {
  return (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      fn(...args, (err: unknown, ...results: unknown[]) =>
        err ? reject(err) : resolve(results.length <= 1 ? results[0] : results),
      );
    });
}

export function callbackify(fn: (...args: any[]) => Promise<any>): (...args: any[]) => void {
  return (...args: unknown[]) => {
    const cb = args.pop() as (err: unknown, value?: unknown) => void;
    fn(...args).then((value) => cb(null, value), (err) => cb(err));
  };
}

export function debuglog(_section: string): (...args: unknown[]) => void {
  return () => {};
}

export const types = {
  isPromise: (v: unknown): boolean =>
    !!v && typeof (v as Promise<unknown>).then === 'function',
  isUint8Array: (v: unknown): boolean => v instanceof Uint8Array,
  isDate: (v: unknown): boolean => v instanceof Date,
  isRegExp: (v: unknown): boolean => v instanceof RegExp,
};

export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

export default {
  format,
  inspect,
  deprecate,
  inherits,
  promisify,
  callbackify,
  debuglog,
  types,
  TextEncoder,
  TextDecoder,
};
