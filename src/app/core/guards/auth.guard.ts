import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = authService.getToken();
  if (!token || authService.isTokenExpired()) {
    router.navigate(['/auth/login']);
    return false;
  }

  if (!authService.currentUser()) {
    await authService.loadCurrentUser();
  }

  return true;
};
