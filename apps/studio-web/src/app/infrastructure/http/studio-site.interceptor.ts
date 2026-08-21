import { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppContextService } from '../../services/app-context.service';

/**
 * Tags backend API calls with the active site so the server-side BFF can scope
 * tenant context per request. Site switching happens without reauthentication.
 */
export const studioSiteInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  if (!req.url.includes('/backend/')) {
    return next(req);
  }

  const appContext = inject(AppContextService);
  const activeSite = appContext.activeSite();
  if (!activeSite) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'x-studio-site-id': activeSite.id } }));
};
