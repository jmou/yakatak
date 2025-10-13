class AssertionError extends Error {}

export function assert(expr: unknown): asserts expr {
  if (expr === false || expr === null || expr === undefined) {
    throw new AssertionError();
  }
}

export function checked<T>(value: T): NonNullable<T> {
  assert(value);
  return value;
}
