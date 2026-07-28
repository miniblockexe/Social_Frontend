import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) return throwError(() => err);

      switch (err.status) {
        case 422: {
          const errors: string[] = err.error?.errors ?? [];
          const msg = errors.length
            ? errors.join('\n')
            : err.error?.message ?? 'Dữ liệu không hợp lệ';
          toastService.error(msg);
          break;
        }
        case 403:
          toastService.error('Bạn không có quyền thực hiện thao tác này');
          break;
        case 404:
          toastService.error('Không tìm thấy dữ liệu');
          break;
        case 429:
          toastService.warning('Quá nhiều yêu cầu, vui lòng thử lại sau');
          break;
        case 500:
          toastService.error('Lỗi máy chủ, vui lòng thử lại sau');
          break;
      }

      return throwError(() => err);
    })
  );
};
