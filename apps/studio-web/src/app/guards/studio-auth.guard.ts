import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import type { StudioPermission } from '../models/studio.models';
import { StudioSessionService } from '../services/studio-session.service';

const DEFAULT_STUDIO_RETURN_TO = '/studio/dashboard';

function resolveStudioReturnTo(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  return normalized.startsWith('/studio/') ? normalized : DEFAULT_STUDIO_RETURN_TO;
}

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
    return router.createUrlTree(['/login'], {
      queryParams: {
        reason: 'session_expired',
        returnTo: state.url,
      },
    });
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
    return router.createUrlTree(['/login'], {
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
