// A Rust-style result type
export type Result<T, E> =
  | { isOk: true; isErr: false; value: T }
  | { isOk: false; isErr: true; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { isOk: true, isErr: false, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { isOk: false, isErr: true, error };
}
