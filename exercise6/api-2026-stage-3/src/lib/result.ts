// A Rust-style result type
export type Result<T, E> =
  | { isOk: true; isErr: false; value: T }
  | { isOk: false; isErr: true; error: E };

export function Ok<T>(value: T) {
  return { isOk: true as const, isErr: false as const, value };
}

export function Err<E>(error: E) {
  return { isOk: false as const, isErr: true as const, error };
}
