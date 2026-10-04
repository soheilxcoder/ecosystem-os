/** Browser shim: node:fs/promises must never actually run in the browser build. */
const unavailable = (name: string): never => {
  throw new Error(`node:fs/promises ${name}() is not available in the browser build`);
};
export const mkdir = (..._args: unknown[]) => unavailable('mkdir');
export const readFile = (..._args: unknown[]) => unavailable('readFile');
export const writeFile = (..._args: unknown[]) => unavailable('writeFile');
export const readdir = (..._args: unknown[]) => unavailable('readdir');
export const rm = (..._args: unknown[]) => unavailable('rm');
export const stat = (..._args: unknown[]) => unavailable('stat');
export const access = (..._args: unknown[]) => unavailable('access');
export const unlink = (..._args: unknown[]) => unavailable('unlink');
export default { mkdir, readFile, writeFile, readdir, rm, stat, access, unlink };
