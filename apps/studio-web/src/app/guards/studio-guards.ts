import { isPlatformServer } from '@angular/common';
import { Injector, PLATFORM_ID, inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { Router } from '@angular/router';

/**
 * The SSR server only renders /studio pages after validating the session cookie itself,
 * and the browser session is not available to the server render, so checks run in the browser.
 */
const onServer = () => isPlatformServer(inject(PLATFORM_ID));

/** Loads the Studio context on demand so public pages never download the Studio API client. */
async function studioContext(injector: Injector) {
  const { AppContextService } = await import('../services/app-context.service');
  return injector.get(AppContextService);
}

function loginRedirect(router: Router, returnTo: string) {
  return router.createUrlTree(['/login'], {
    queryParams: {
      reason: 'session_expired',
      returnTo,
    },
  });
}

export const studioAuthGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  if (onServer()) {
    return true;
  }
  const router = inject(Router);
  const injector = inject(Injector);

  try {
    await (await studioContext(injector)).ensureSession();
    return true;
  } catch {
    return loginRedirect(router, state.url);
  }
};

export const studioRoleGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  if (onServer()) {
    return true;
  }
  const router = inject(Router);
  const injector = inject(Injector);
  const requiredRole = route.data['requiredRole'] as 'admin' | 'editor' | 'viewer' | undefined;

  const appContext = await studioContext(injector);
  try {
    await appContext.ensureSession();
  } catch {
    return loginRedirect(router, state.url);
  }

  if (!requiredRole) {
    return true;
  }

  const role = appContext.role();
  const rank: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };
  if ((rank[role] ?? 0) >= (rank[requiredRole] ?? 0)) {
    return true;
  }

  return router.createUrlTree(['/studio/overview']);
};
