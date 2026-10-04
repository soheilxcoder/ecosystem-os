/**
 * Stub for `stream/promises`. PGlite only imports it inside an
 * `IN_NODE`-guarded branch (loading extension bundles from disk), which never
 * executes in the browser — but the bundler still resolves it.
 */
export const pipeline = async (..._args: unknown[]): Promise<void> => {
  throw new Error('stream/promises.pipeline is not available in the browser build');
};
export const finished = async (..._args: unknown[]): Promise<void> => {
  throw new Error('stream/promises.finished is not available in the browser build');
};
export default { pipeline, finished };
