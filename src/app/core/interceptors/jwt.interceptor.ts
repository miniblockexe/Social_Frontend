import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  filter,
  switchMap,
  take,
  throwError,
} from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../models/api.models';
import { AuthResponse } from '../models/auth.models';

const isRefreshing$ = new BehaviorSubject<boolean>(false);
const refreshToken$ = new BehaviorSubject<string | null>(null);

const SKIP_URLS = ['/auth/login', '/auth/register', '/auth/refresh'];

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const jwtInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);

  if (SKIP_URLS.some(url => req.url.includes(url))) {
    return next(req);
  }

  const token = authService.getToken();
  const authReq = token ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401) return throwError(() => err);

      if (isRefreshing$.getValue()) {
        return refreshToken$.pipe(
          filter((t): t is string => t !== null),
          take(1),
          switchMap(newToken => next(addToken(req, newToken)))
        );
      }

      isRefreshing$.next(true);
      refreshToken$.next(null);

      return authService.refreshToken().pipe(
        switchMap((res: ApiResponse<AuthResponse>) => {
          isRefreshing$.next(false);
          refreshToken$.next(res.data.accessToken);
          return next(addToken(req, res.data.accessToken));
        }),
        catchError(refreshErr => {
          isRefreshing$.next(false);
          authService.logout();
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
