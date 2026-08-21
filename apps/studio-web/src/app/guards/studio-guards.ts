import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import { AppContextService } from '../services/app-context.service';

const DEFAULT_RETURN_TO = '/studio/overview';

function resolveReturnTo(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  return normalized.startsWith('/studio/') ? normalized : DEFAULT_RETURN_TO;
}

export const studioAuthGuard: CanActivateFn = async (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const router = inject(Router);
  const appContext = inject(AppContextService);

  try {
    await appContext.ensureSession();
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

export const studioRoleGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const router = inject(Router);
  const appContext = inject(AppContextService);
  const requiredRole = route.data['requiredRole'] as 'admin' | 'editor' | 'viewer' | undefined;

  try {
    await appContext.ensureSession();
  } catch {
    return router.createUrlTree(['/login'], {
      queryParams: {
        reason: 'session_expired',
        returnTo: state.url,
      },
    });
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
