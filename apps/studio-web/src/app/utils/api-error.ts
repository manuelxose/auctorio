import { HttpErrorResponse } from '@angular/common/http';

export function formatApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message =
      typeof error.error === 'object' && error.error && 'message' in error.error
        ? String(error.error.message)
        : error.message;
    return message || `HTTP ${error.status}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Ha ocurrido un error inesperado.';
}
