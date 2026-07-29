import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';

export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.getToken();
  if (!token) return true;

  if (auth.isTokenExpired()) {
    try {
      await firstValueFrom(auth.refreshToken());
    } catch {
      return true;
    }
  }

  if (!auth.currentUser()) {
    try {
      await auth.loadCurrentUser();
    } catch {
      return true;
    }
  }

  if (auth.currentUser()) {
    router.navigate(['/home']);
    return false;
  }

  return true;
};
