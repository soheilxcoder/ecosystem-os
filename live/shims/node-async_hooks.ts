/** Browser shim for node:async_hooks — Fastify only needs AsyncResource. */

export class AsyncResource {
  type: string;
  constructor(type: string, _options?: unknown) {
    this.type = type;
  }
  runInAsyncScope<T>(fn: (this: unknown, ...args: unknown[]) => T, thisArg?: unknown, ...args: unknown[]): T {
    return fn.call(thisArg, ...args);
  }
  bind<Func extends (...args: unknown[]) => unknown>(fn: Func): Func {
    return fn;
  }
  emitDestroy(): this {
    return this;
  }
  asyncId(): number {
    return 0;
  }
  triggerAsyncId(): number {
    return 0;
  }
}

export function executionAsyncId(): number {
  return 0;
}

export default { AsyncResource, executionAsyncId };
