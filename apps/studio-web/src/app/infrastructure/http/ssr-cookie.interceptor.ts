import { HttpInterceptorFn } from '@angular/common/http';
import { inject, REQUEST } from '@angular/core';

export const ssrCookieInterceptor: HttpInterceptorFn = (req, next) => {
  const request = inject(REQUEST, { optional: true });
  const cookieHeader = request?.headers.get('cookie');

  if (!cookieHeader) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        cookie: cookieHeader,
      },
    }),
  );
};
