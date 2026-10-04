/** Browser shim for node:perf_hooks — browsers already expose performance. */

export const performance = globalThis.performance;

export function performanceObserverNever(): void {}

export default { performance };
