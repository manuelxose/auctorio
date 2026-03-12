import { isPlatformBrowser } from '@angular/common';
import { inject, InjectionToken, PLATFORM_ID, REQUEST } from '@angular/core';

function normalizeOrigin(value: string): string {
  return value.replace(/\/$/, '');
}

export const STUDIO_ORIGIN = new InjectionToken<string>('STUDIO_ORIGIN', {
  providedIn: 'root',
  factory: () => {
    const platformId = inject(PLATFORM_ID);
    const request = inject(REQUEST, { optional: true });

    if (isPlatformBrowser(platformId) && !request) {
      return normalizeOrigin(window.location.origin);
    }

    const protocol =
      request?.headers.get('x-forwarded-proto') ||
      (request?.url.startsWith('https://') ? 'https' : 'http');
    const host =
      request?.headers.get('x-forwarded-host') ||
      request?.headers.get('host') ||
      '127.0.0.1:4000';

    return normalizeOrigin(`${protocol}://${host}`);
  },
});
