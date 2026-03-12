export type UseCaseError = {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
};

export type UseCaseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: UseCaseError };

export function ok<T>(data: T): UseCaseResult<T> {
  return { ok: true, data };
}

export function err(code: string, message: string, details?: Record<string, unknown> | null): UseCaseResult<never> {
  return { ok: false, error: { code, message, details: details ?? null } };
}
