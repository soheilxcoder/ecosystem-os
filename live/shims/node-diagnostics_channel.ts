/** No-op browser shim for node:diagnostics_channel. */

interface Channel {
  hasSubscribers: boolean;
  subscribe: (fn: unknown) => void;
  unsubscribe: (fn: unknown) => void;
  publish: (message: unknown) => void;
}

const noopChannel: Channel = {
  hasSubscribers: false,
  subscribe: () => {},
  unsubscribe: () => {},
  publish: () => {},
};

interface TracingChannel {
  start: (message: unknown) => void;
  end: (message: unknown) => void;
  asyncStart: (message: unknown) => void;
  asyncEnd: (message: unknown) => void;
  error: (message: unknown) => void;
  traceCallback: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => T;
  traceSync: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => T;
  tracePromise: <T>(fn: (...args: unknown[]) => Promise<T>, ...args: unknown[]) => Promise<T>;
  hasSubscribers: boolean;
  subscribe: (events: unknown) => void;
  unsubscribe: (events: unknown) => void;
}

const noopTracingChannel: TracingChannel = {
  start: () => {},
  end: () => {},
  asyncStart: () => {},
  asyncEnd: () => {},
  error: () => {},
  traceCallback: (fn, ...args) => fn(...args),
  traceSync: (fn, ...args) => fn(...args),
  tracePromise: (fn, ...args) => fn(...args),
  hasSubscribers: false,
  subscribe: () => {},
  unsubscribe: () => {},
};

export function channel(_name: string): Channel {
  return noopChannel;
}
export function tracingChannel(_name: string): TracingChannel {
  return noopTracingChannel;
}
export function subscribe(_name: string, _fn: unknown): void {}
export function unsubscribe(_name: string, _fn: unknown): void {}
export function hasSubscribers(_name: string): boolean {
  return false;
}

export default { channel, tracingChannel, subscribe, unsubscribe, hasSubscribers };
