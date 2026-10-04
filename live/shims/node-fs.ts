/** Browser shim for node:fs — any real use throws a clear error. */
const unavailable = (name: string): never => {
  throw new Error(`node:fs ${name}() is not available in the browser build`);
};
export const readFileSync = (..._args: unknown[]) => unavailable('readFileSync');
export const writeFileSync = (..._args: unknown[]) => unavailable('writeFileSync');
export const mkdirSync = (..._args: unknown[]) => unavailable('mkdirSync');
export const existsSync = () => false;
export const promises = {
  mkdir: (..._args: unknown[]) => unavailable('promises.mkdir'),
  readFile: (..._args: unknown[]) => unavailable('promises.readFile'),
  writeFile: (..._args: unknown[]) => unavailable('promises.writeFile'),
  readdir: (..._args: unknown[]) => unavailable('promises.readdir'),
  rm: (..._args: unknown[]) => unavailable('promises.rm'),
  stat: (..._args: unknown[]) => unavailable('promises.stat'),
  access: (..._args: unknown[]) => unavailable('promises.access'),
  unlink: (..._args: unknown[]) => unavailable('promises.unlink'),
};
export default { readFileSync, writeFileSync, mkdirSync, existsSync, promises };
