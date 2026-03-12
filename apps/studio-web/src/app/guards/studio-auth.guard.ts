import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import type { StudioPermission } from '../models/studio.models';
import { StudioSessionService } from '../services/studio-session.service';

export const studioAuthGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const router = inject(Router);
  const session = inject(StudioSessionService);

  try {
    await session.ensureSession();
    return true;
  } catch {
    return router.createUrlTree(['/studio/login'], {
      queryParams: {
        reason: 'session_expired',
        returnTo: state.url,
      },
    });
  }
};

export const studioLoginGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const session = inject(StudioSessionService);

  try {
    const current = await session.ensureSession();
    return current ? router.createUrlTree(['/studio/dashboard']) : true;
  } catch {
    return true;
  }
};

export const studioPermissionGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const router = inject(Router);
  const session = inject(StudioSessionService);
  const requiredPermission = route.data['requiredPermission'] as StudioPermission | undefined;

  try {
    await session.ensureSession();
  } catch {
    return router.createUrlTree(['/studio/login'], {
      queryParams: {
        reason: 'session_expired',
        returnTo: state.url,
      },
    });
  }

  if (!requiredPermission || session.hasPermission(requiredPermission)) {
    return true;
  }

  return router.createUrlTree(['/studio/dashboard']);
};
