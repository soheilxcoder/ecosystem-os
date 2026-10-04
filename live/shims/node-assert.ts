/** Tiny browser shim for node:assert (Fastify/light-my-request usage). */

class AssertionError extends Error {
  code = 'ERR_ASSERTION';
}

function assert(value: unknown, message?: string | Error): asserts value {
  if (!value) {
    throw message instanceof Error
      ? message
      : new AssertionError(message ?? `The expression evaluated to a falsy value: ${String(value)}`);
  }
}

assert.ok = assert;
assert.fail = (message?: string): never => {
  throw new AssertionError(message ?? 'assert.fail()');
};
assert.strictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(message ?? `Expected ${String(expected)} to strictly equal ${String(actual)}`);
  }
};
assert.notStrictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (Object.is(actual, expected)) {
    throw new AssertionError(message ?? `Expected values to differ`);
  }
};
assert.deepStrictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new AssertionError(message ?? 'Expected deep equality');
  }
};
assert.throws = (fn: () => unknown): void => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new AssertionError('Expected function to throw');
};
assert.rejects = async (fn: () => Promise<unknown>): Promise<void> => {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new AssertionError('Expected promise to reject');
};

export default assert;
export { AssertionError };
