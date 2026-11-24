import { isPlatformServer } from '@angular/common';
import { Injector, PLATFORM_ID, inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import { activeNavItem, canSeeNavItem } from '../layout/studio-nav';

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

export const studioPermissionGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  if (onServer()) {
    return true;
  }
  const router = inject(Router);
  const injector = inject(Injector);
  const item = activeNavItem(state.url)?.item;
  if (!item?.permissions) return true;
  const appContext = await studioContext(injector);
  try {
    await appContext.ensureSession();
  } catch {
    return loginRedirect(router, state.url);
  }

  return canSeeNavItem(item, appContext.permissions()) || router.createUrlTree(['/studio/overview']);
};
