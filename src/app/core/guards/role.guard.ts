import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isAdmin()) {
    return true;
  }

  if (!authService.currentUser()) {
    if (authService.isTokenExpired()) {
      try {
        await firstValueFrom(authService.refreshToken());
      } catch {
        router.navigate(['/auth/login']);
        return false;
      }
    }
    try {
      await authService.loadCurrentUser();
    } catch {}
  } else {
    try {
      await authService.loadCurrentUser();
    } catch {}
  }

  if (!authService.isAdmin()) {
    router.navigate(['/home']);
    return false;
  }

  return true;
};